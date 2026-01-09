import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Date formatting utilities for legal documents
export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function formatDateTime(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Case status utilities (Adapted for LawClick v8.0)
export function getCaseStatusColor(status: string): string {
  const statusColors: Record<string, string> = {
    'LEAD': 'text-muted-foreground',
    'INTAKE': 'text-info-foreground bg-info',
    'ACTIVE': 'text-primary',
    'SUSPENDED': 'text-warning-foreground bg-warning',
    'CLOSED': 'text-success',
    'ARCHIVED': 'text-muted-foreground',
  };
  return statusColors[status] || 'text-muted-foreground';
}

export function getCaseStatusText(status: string): string {
  const statusTexts: Record<string, string> = {
    'LEAD': '线索',
    'INTAKE': '立案审查',
    'ACTIVE': '在办',
    'SUSPENDED': '中止',
    'CLOSED': '结案',
    'ARCHIVED': '归档',
  };
  return statusTexts[status] || '未知状态';
}

// File size formatting
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Currency formatting
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
  }).format(amount);
}
