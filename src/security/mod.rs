//! 安全与鉴权（极限标准）
//!
//! - 认证（JWT Claims 抽取）
//! - 密码校验（与 Next.js 主线兼容）
//! - 权限（Role → Permission）
//! - 输入校验（统一 Extractor）

pub mod jwt;
pub mod password;
pub mod permissions;
pub mod validation;
pub mod case_access;
pub mod current_user;
