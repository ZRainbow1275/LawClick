import "server-only"

import { getErrorMessage } from "@/lib/action-result"
import { logger } from "@/lib/logger"
import { PDFParse } from "pdf-parse"

export class PdfParseError extends Error {
    override name = "PdfParseError"
}

export async function parsePdf(buffer: Buffer): Promise<string> {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new PdfParseError("无效的 PDF 文件内容")
    }

    const parser = new PDFParse({ data: buffer })
    try {
        const result = await parser.getText()
        return result.text
    } catch (error) {
        throw new PdfParseError(`PDF 解析失败：${getErrorMessage(error, "未知错误")}`, { cause: error })
    } finally {
        try {
            await parser.destroy()
        } catch (error) {
            logger.error("PDF parser cleanup failed", error)
        }
    }
}
