import { test, expect } from "@playwright/test"

test("API：realtime signals 未登录返回 401", async ({ request }) => {
    const res = await request.get("/api/realtime/signals")
    expect(res.status()).toBe(401)
    expect(await res.text()).toContain("未登录")
})

