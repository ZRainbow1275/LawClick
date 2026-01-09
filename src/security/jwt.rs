//! JWT Claims & Extractor
//!
//! 说明：
//! - Rust API 自身使用 `JWT_SECRET` 签发/验证 Token。
//! - 为与 Web 主线（NextAuth/Auth.js）统一鉴权，本模块同时支持解密 Auth.js 的 JWE Token。
//! - 为避免“看似登录成功、实际后端未鉴权”的空壳风险，Claims 抽取器失败将直接返回 401。

use axum::extract::FromRequestParts;
use axum::http::{
    header::{AUTHORIZATION, COOKIE},
    request::Parts,
};
use aes::Aes256;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use cbc::Decryptor;
use cbc::cipher::{block_padding::Pkcs7, BlockDecryptMut, KeyIvInit};
use hkdf::Hkdf;
use hmac::{Hmac, Mac};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use sha2::{Sha256, Sha512};
use serde::{Deserialize, Serialize};
use subtle::ConstantTimeEq;

use crate::config::AppConfig;
use crate::db::AppState;
use crate::error::{AppError, AppResult};

/// 统一的状态类型别名，减少泛型噪音
pub type AppStateArc = std::sync::Arc<AppState>;

/// JWT Claims 结构
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    /// 用户ID
    pub sub: String,
    /// 用户邮箱
    pub email: String,
    /// 用户角色（大写字符串，如 "PARTNER"）
    pub role: String,
    /// 用户姓名
    pub name: String,
    /// 过期时间（Unix 时间戳）
    pub exp: usize,
    /// 签发时间
    pub iat: usize,
}

fn extract_bearer_token(authorization: &str) -> Option<&str> {
    let trimmed = authorization.trim();
    if trimmed.len() <= 7 {
        return None;
    }
    if trimmed.to_ascii_lowercase().starts_with("bearer ") {
        Some(trimmed[7..].trim())
    } else {
        None
    }
}

fn unquote_cookie_value(value: &str) -> &str {
    let trimmed = value.trim();
    if trimmed.len() >= 2 && trimmed.starts_with('"') && trimmed.ends_with('"') {
        &trimmed[1..trimmed.len() - 1]
    } else {
        trimmed
    }
}

fn parse_cookie_pairs(cookie_header: &str) -> Vec<(&str, &str)> {
    cookie_header
        .split(';')
        .filter_map(|part| {
            let trimmed = part.trim();
            if trimmed.is_empty() {
                return None;
            }
            let mut iter = trimmed.splitn(2, '=');
            let name = iter.next()?.trim();
            let value = iter.next()?.trim();
            if name.is_empty() || value.is_empty() {
                return None;
            }
            Some((name, value))
        })
        .collect()
}

fn extract_authjs_session_token_from_cookie_header(cookie_header: &str) -> Option<String> {
    let pairs = parse_cookie_pairs(cookie_header);
    if pairs.is_empty() {
        return None;
    }

    for base in authjs_salt_candidates() {
        if let Some((_, raw)) = pairs.iter().find(|(name, _)| *name == base) {
            let value = unquote_cookie_value(raw);
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }

        let prefix = format!("{base}.");
        let mut chunks: Vec<(usize, &str)> = Vec::new();
        for (name, raw) in pairs.iter() {
            let Some(rest) = name.strip_prefix(&prefix) else {
                continue;
            };
            let Ok(idx) = rest.parse::<usize>() else {
                continue;
            };
            let value = unquote_cookie_value(raw);
            if value.is_empty() {
                continue;
            }
            chunks.push((idx, value));
        }

        if chunks.is_empty() {
            continue;
        }

        chunks.sort_by_key(|(idx, _)| *idx);
        // Auth.js/NextAuth 的 cookie chunking 期望从 0 开始连续拼接
        if chunks
            .iter()
            .enumerate()
            .any(|(expected, (idx, _))| *idx != expected)
        {
            continue;
        }

        let mut token = String::new();
        for (_, value) in chunks {
            token.push_str(value);
        }
        if !token.is_empty() {
            return Some(token);
        }
    }

    None
}

fn decode_rust_jwt_claims(token: &str, jwt_secret: &str) -> AppResult<Claims> {
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(jwt_secret.as_bytes()),
        &Validation::new(Algorithm::HS256),
    )
    .map_err(|_| AppError::Unauthorized("无效或过期的 Token".to_string()))?;
    Ok(data.claims)
}

fn authjs_salt_candidates() -> [&'static str; 4] {
    [
        "__Secure-authjs.session-token",
        "authjs.session-token",
        "__Secure-next-auth.session-token",
        "next-auth.session-token",
    ]
}

fn derive_authjs_encryption_key(secret: &str, salt: &str, key_len: usize) -> AppResult<Vec<u8>> {
    let hk = Hkdf::<Sha256>::new(Some(salt.as_bytes()), secret.as_bytes());
    let info = format!("Auth.js Generated Encryption Key ({salt})");
    let mut out = vec![0u8; key_len];
    hk.expand(info.as_bytes(), &mut out)
        .map_err(|_| AppError::Internal("Auth.js 密钥派生失败（HKDF expand）".to_string()))?;
    Ok(out)
}

fn base64url_decode(input: &str) -> AppResult<Vec<u8>> {
    URL_SAFE_NO_PAD
        .decode(input.as_bytes())
        .map_err(|_| AppError::Unauthorized("Token 编码无效".to_string()))
}

fn decrypt_authjs_jwe_a256cbc_hs512(token: &str, secret: &str, salt: &str) -> AppResult<serde_json::Value> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 5 {
        return Err(AppError::Unauthorized("无效的 Token 格式".to_string()));
    }

    let protected_b64 = parts[0];
    let encrypted_key_b64 = parts[1];
    let iv_b64 = parts[2];
    let ciphertext_b64 = parts[3];
    let tag_b64 = parts[4];

    let protected = base64url_decode(protected_b64)?;
    let header_json: serde_json::Value =
        serde_json::from_slice(&protected).map_err(|_| AppError::Unauthorized("Token 头解析失败".to_string()))?;

    let alg = header_json.get("alg").and_then(|v| v.as_str()).unwrap_or("");
    let enc = header_json.get("enc").and_then(|v| v.as_str()).unwrap_or("");
    if alg != "dir" {
        return Err(AppError::Unauthorized("不支持的 Token alg".to_string()));
    }
    if enc != "A256CBC-HS512" {
        return Err(AppError::Unauthorized("不支持的 Token enc".to_string()));
    }

    let encrypted_key = base64url_decode(encrypted_key_b64)?;
    if !encrypted_key.is_empty() {
        return Err(AppError::Unauthorized("无效的 Token（encrypted_key 应为空）".to_string()));
    }

    let iv = base64url_decode(iv_b64)?;
    if iv.len() != 16 {
        return Err(AppError::Unauthorized("无效的 Token（IV 长度不合法）".to_string()));
    }

    let ciphertext = base64url_decode(ciphertext_b64)?;
    if ciphertext.is_empty() || ciphertext.len() % 16 != 0 {
        return Err(AppError::Unauthorized("无效的 Token（ciphertext 长度不合法）".to_string()));
    }

    let tag = base64url_decode(tag_b64)?;
    if tag.len() != 32 {
        return Err(AppError::Unauthorized("无效的 Token（tag 长度不合法）".to_string()));
    }

    let cek = derive_authjs_encryption_key(secret, salt, 64)?;
    let mac_key = &cek[..32];
    let enc_key = &cek[32..];

    // AAD 是 compact header 的 base64url 原文（而不是解码后的 header JSON）
    let aad = protected_b64.as_bytes();
    let al = u64::try_from(aad.len())
        .unwrap_or(0)
        .saturating_mul(8)
        .to_be_bytes();

    type HmacSha512 = Hmac<Sha512>;
    let mut mac = HmacSha512::new_from_slice(mac_key)
        .map_err(|_| AppError::Internal("HMAC 初始化失败".to_string()))?;
    mac.update(aad);
    mac.update(&iv);
    mac.update(&ciphertext);
    mac.update(&al);
    let full_tag = mac.finalize().into_bytes();
    let expected_tag = &full_tag[..32];
    if expected_tag.ct_eq(&tag).unwrap_u8() != 1 {
        return Err(AppError::Unauthorized("无效或过期的 Token".to_string()));
    }

    let mut buf = ciphertext;
    let decryptor = Decryptor::<Aes256>::new_from_slices(enc_key, &iv)
        .map_err(|_| AppError::Unauthorized("无效的 Token（解密参数非法）".to_string()))?;
    let plaintext = decryptor
        .decrypt_padded_mut::<Pkcs7>(&mut buf)
        .map_err(|_| AppError::Unauthorized("无效或过期的 Token".to_string()))?;

    serde_json::from_slice(plaintext).map_err(|_| AppError::Unauthorized("Token 载荷解析失败".to_string()))
}

fn parse_usize_claim(value: Option<&serde_json::Value>, field: &'static str) -> AppResult<usize> {
    let v = value.ok_or_else(|| AppError::Unauthorized(format!("Token 缺少字段：{field}")))?;
    if let Some(u) = v.as_u64() {
        return Ok(usize::try_from(u).map_err(|_| AppError::Unauthorized(format!("Token 字段溢出：{field}")))?);
    }
    if let Some(i) = v.as_i64() {
        if i < 0 {
            return Err(AppError::Unauthorized(format!("Token 字段为负：{field}")));
        }
        return Ok(usize::try_from(i as u64).map_err(|_| AppError::Unauthorized(format!("Token 字段溢出：{field}")))?);
    }
    Err(AppError::Unauthorized(format!("Token 字段类型不合法：{field}")))
}

fn claims_from_authjs_payload(payload: serde_json::Value) -> AppResult<Claims> {
    let sub = payload
        .get("id")
        .and_then(|v| v.as_str())
        .or_else(|| payload.get("sub").and_then(|v| v.as_str()))
        .ok_or_else(|| AppError::Unauthorized("Token 缺少用户标识（id/sub）".to_string()))?
        .to_string();

    let email = payload
        .get("email")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::Unauthorized("Token 缺少 email".to_string()))?
        .to_string();

    let role = payload
        .get("role")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::Unauthorized("Token 缺少 role".to_string()))?
        .to_string();

    let name = payload
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("用户")
        .to_string();

    let exp = parse_usize_claim(payload.get("exp"), "exp")?;
    let iat = parse_usize_claim(payload.get("iat"), "iat")?;

    let now = chrono::Utc::now().timestamp();
    let now = usize::try_from(now.max(0) as u64).unwrap_or(0);
    // Auth.js 解码允许 15s 时钟偏差：exp + 15 < now 则视为过期
    if exp.saturating_add(15) < now {
        return Err(AppError::Unauthorized("无效或过期的 Token".to_string()));
    }

    Ok(Claims {
        sub,
        email,
        role,
        name,
        exp,
        iat,
    })
}

fn decode_authjs_claims(token: &str, secret: &str) -> AppResult<Claims> {
    // Auth.js 默认 enc=A256CBC-HS512（A256CBC + HS512，64 bytes CEK）
    for salt in authjs_salt_candidates() {
        let json = match decrypt_authjs_jwe_a256cbc_hs512(token, secret, salt) {
            Ok(v) => v,
            Err(_) => continue,
        };
        return claims_from_authjs_payload(json);
    }

    Err(AppError::Unauthorized("无效或过期的 Token".to_string()))
}

pub fn decode_claims_any(token: &str, config: &AppConfig) -> AppResult<Claims> {
    match token.split('.').count() {
        3 => decode_rust_jwt_claims(token, &config.jwt_secret),
        5 => decode_authjs_claims(token, &config.nextauth_secret),
        _ => Err(AppError::Unauthorized("无效的 Token 格式".to_string())),
    }
}

impl FromRequestParts<AppStateArc> for Claims {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppStateArc) -> Result<Self, Self::Rejection> {
        if let Some(auth) = parts.headers.get(AUTHORIZATION).and_then(|v| v.to_str().ok()) {
            let token = extract_bearer_token(auth)
                .ok_or_else(|| AppError::Unauthorized("无效的 Authorization 格式".to_string()))?;
            return decode_claims_any(token, &state.config);
        }

        let cookie_header = parts.headers.get(COOKIE).and_then(|v| v.to_str().ok());
        if let Some(cookie_header) = cookie_header {
            if let Some(token) = extract_authjs_session_token_from_cookie_header(cookie_header) {
                return decode_claims_any(&token, &state.config);
            }
        }

        Err(AppError::Unauthorized("缺少 Authorization 或 Session Cookie".to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn can_decode_authjs_jwe_a256cbc_hs512() {
        // 由 `@auth/core/jwt.encode` 生成（salt=authjs.session-token，maxAge=50y）
        let token = "eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2Q0JDLUhTNTEyIiwia2lkIjoiVmhvZ2IxdnllR01JTU1rX3VGSUpaWEpINnM1VGFkSDRsY1VmX2NCRXBCUGhJa3kxLXJTUHNGZUpOd0xNZjVSeHJaei16TXI2NjJRZXdJU3hpdFJ3U0EifQ..zwrTlX-W1O9bJSmn9t5TFw.2z5BVywncKTq3RjVe2nyU_CqUUYjJ92aTAj98u5OuG7PqnRokLyfsoqBE8-xEZakBd2iEqEK-gAeARWYqsHvUR7pd2Gi9HeKFWTVNTI1l2HV96mnbxyARKqRjFI6VxfXtNi7IkWXPlMxoB2WxtMiuBIm-OQQudxZArPB4oZOour5yYEjiP3Lk2Hc0tOy9dG60nxuai1jYjNmyDa9QdMpdw.z_LLuUpRLBVIm4NlsElWqFZc7CLiJIGLJCRNPQFqS4w";

        let config = AppConfig {
            database_url: "postgresql://postgres:password@127.0.0.1:5434/lawclick?schema=public".to_string(),
            jwt_secret: "rust-jwt-secret-0123456789abcdef0123456789".to_string(),
            nextauth_secret: "test-nextauth-secret-0123456789abcdef".to_string(),
            s3_endpoint: "http://127.0.0.1:9000".to_string(),
            s3_access_key: "minioadmin".to_string(),
            s3_secret_key: "minioadmin".to_string(),
            s3_bucket_name: "lawclick".to_string(),
            port: 8080,
            cors_allow_any: false,
            cors_allow_origins: vec![],
            openai_api_key: None,
            openai_base_url: "https://api.openai.com/v1".to_string(),
            openai_model: "gpt-4o-mini".to_string(),
        };

        let claims = decode_claims_any(token, &config).expect("should decode authjs token");
        assert_eq!(claims.sub, "user-123");
        assert_eq!(claims.email, "a@example.com");
        assert_eq!(claims.role, "PARTNER");
        assert_eq!(claims.name, "Alice");
    }
}
