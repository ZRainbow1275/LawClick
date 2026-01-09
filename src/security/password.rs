//! 密码处理（与 Web 主线兼容）
//!
//! 当前 Web 主线（lawclick-next）使用 `bcrypt`（bcryptjs）存储密码哈希。
//! 为保证 Rust 原型与主线同库可用，这里必须至少支持 bcrypt 校验。
//!
//! 同时：为了未来迁移与兼容，也允许识别并校验 argon2 哈希（如果历史数据存在）。

use argon2::{Argon2, PasswordHash, PasswordVerifier};

use crate::error::{AppError, AppResult};

fn is_bcrypt_hash(hash: &str) -> bool {
    let h = hash.trim();
    h.starts_with("$2a$") || h.starts_with("$2b$") || h.starts_with("$2y$") || h.starts_with("$2$")
}

fn is_argon2_hash(hash: &str) -> bool {
    hash.trim().starts_with("$argon2")
}

pub fn verify_password(password: &str, password_hash: &str) -> AppResult<()> {
    let pw = password.to_string();
    let hash = password_hash.trim();

    if is_bcrypt_hash(hash) {
        let ok = bcrypt::verify(pw, hash).map_err(|_| AppError::Internal("密码校验失败".to_string()))?;
        if ok {
            return Ok(());
        }
        return Err(AppError::Unauthorized("用户不存在或密码错误".to_string()));
    }

    if is_argon2_hash(hash) {
        let parsed = PasswordHash::new(hash).map_err(|_| AppError::Internal("密码哈希格式错误".to_string()))?;
        Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .map_err(|_| AppError::Unauthorized("用户不存在或密码错误".to_string()))?;
        return Ok(());
    }

    Err(AppError::Internal("不支持的密码哈希格式".to_string()))
}

