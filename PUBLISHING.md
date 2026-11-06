# 发布到 npm 与 MCP Registry

当前机器没有 npm 账号，因此 magpie 市场搜索/一键安装还不能生效。代码和元数据已经准备好；拿到 npm 账号后按下面步骤发布即可。

## 1. 发布 npm 包

```powershell
npm login
npm run build
npm test
npm pack --dry-run
npm publish --access public
```

发布前确认：

- `package.json` 的 `name` 是 `volcengine-ark-media-mcp`
- `package.json` 的 `mcpName` 是 `io.github.MrLinWang/volcengine-ark-media-mcp`
- `server.json` 的 `name` 与 `mcpName` 完全一致
- 版本号在 `package.json` 和 `server.json` 中同步

## 2. 发布到官方 MCP Registry

先确认 npm 包已经可以公开访问：

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
