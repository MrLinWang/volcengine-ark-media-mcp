# 发布到 npm 与 MCP Registry

## 当前状态

已发布：

- npm：`volcengine-ark-media-mcp@1.0.0`（https://www.npmjs.com/package/volcengine-ark-media-mcp）
- MCP Registry：`io.github.MrLinWang/volcengine-ark-media-mcp`（status: active）

在 magpie 的 Library → MCP servers 中搜索 `volcengine` 或 `ark` 即可安装。

## 1. 发布 npm 包（新版本时）

```powershell
npm login
npm run build
npm test
npm pack --dry-run
npm publish --access public
```

> npm 可能把首次发布放入 staged publishing：先创建 `0.0.0-stage` 占位版本，再到
> https://www.npmjs.com/settings/<user>/staged-packages 点 Approve 才会正式上线。

发布前确认：

- `package.json` 的 `name` 是 `volcengine-ark-media-mcp`
- `package.json` 的 `mcpName` 是 `io.github.MrLinWang/volcengine-ark-media-mcp`
- `server.json` 的 `name` 与 `mcpName` 完全一致
- 版本号在 `package.json` 和 `server.json` 中同步

## 2. 发布到官方 MCP Registry（新版本时）

先确认 npm 包已经可以公开访问（`dist-tags.latest` 应为正式版本，而不是 `0.0.0-stage`）：

```powershell
npm view volcengine-ark-media-mcp version
```

然后执行仓库内的脚本：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\publish-registry.ps1
```

脚本会：

1. 从 GitHub Releases 下载最新的 `mcp-publisher` 到 `tools/`
2. 执行 `mcp-publisher validate server.json`
3. 打开浏览器完成 `mcp-publisher login github`
4. 执行 `mcp-publisher publish`

也可以手动执行：

```powershell
.\tools\mcp-publisher.exe validate .\server.json
.\tools\mcp-publisher.exe login github
.\tools\mcp-publisher.exe publish .\server.json
```

## 3. 验证 Registry 条目

```powershell
curl.exe "https://registry.modelcontextprotocol.io/v0/servers?search=volcengine&limit=10&version=latest"
```

应能看到 `io.github.MrLinWang/volcengine-ark-media-mcp`。

## 4. 在 magpie 中搜索安装

打开 magpie → Library → MCP servers，搜索：

- `volcengine`
- `ark`
- `volcengine-ark-media-mcp`

安装时填写 `ARC_AGENT_PLAN_KEY`，然后勾选要使用该 MCP 的 agent。

## 版本更新

每次发布新版本：

1. 修改 `package.json` 的 `version`
2. 修改 `server.json` 的 `version` 和 `packages[0].version`
3. 重新执行 `npm publish --access public`
4. 重新执行 `mcp-publisher publish`

## 备注

- npm 包必须是公开包，Registry 会校验 npm 包中的 `mcpName`。
- GitHub 登录会授权 `io.github.MrLinWang/*` 命名空间。
- 如果 GitHub Actions 中发布，可使用 `mcp-publisher login github-oidc`，需要 `id-token: write` 权限。
