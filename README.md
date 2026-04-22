# PaySys

PaySys 是一个轻量订阅中转后台。它可以按群绑定不同的上游 LILISI 账号，刷新并缓存对应订阅内容，再给客户提供你自己的稳定订阅地址，同时管理客户 QQ、群名、到期时间、续费和禁用状态。

当前主流程：

1. 客户打开 `/portal`，可输入 QQ 登录；未登记客户可提交昵称和 QQ 申请。
2. 管理员在 `/admin` 查看注册申请，选择 `1群`、`2群` 等群名并分配。
3. 客户付款后，管理员登记续费。
4. 客户点击“获取订阅”，页面显示 `/sub/[token]` 订阅链接和二维码。
5. Clash、Singbox、Hiddify 等客户端请求 `/sub/[token]`，只有有效客户才能拿到缓存订阅内容。

QQ 群里只发 `/portal` 入口文案，不发 LILISI 后台地址，不发真实上游临时链接。

## 功能

- 后台登录：`/admin` 使用 `.env` 里的 `ADMIN_PASSWORD`。
- 自助申请：客户可在 `/portal` 提交昵称和 QQ；管理员收到申请后分配群并创建客户。
- 客户管理：昵称、QQ、群名、备注、到期时间、禁用状态、VIP；客户列表里可直接编辑备注，离开输入框自动保存。
- 群名选择：新增客户时默认支持 `1群`、`2群`，也会自动带入已绑定上游账号的群名。
- 群筛选与批量处理：客户列表可按群筛选，并支持批量标记或取消 VIP。
- 上游账号：后台可为不同群绑定不同 LILISI 账号；客户拉取订阅时按所属群使用对应账号缓存。
- 续费登记：默认金额 `45`，默认天数 `180`，到期时间按续费天数自动延长。
- 访问统计：后台记录客户点击“获取订阅”的次数和最近时间。
- 获取明细：后台展示最近获取记录，包含客户、动作、时间、IP、设备/客户端等信息。
- 数据重置：清空付款记录和获取次数，保留备注，重置 token 和登录状态。
- 删除账号：删除客户及其付款记录、访问记录。
- 客户入口：`/portal` 输入 QQ 登录，同一设备会自动记住。
- 订阅中转：`/sub/[token]` 返回缓存订阅内容，过期、禁用、无效 token 不返回真实订阅。
- 上游刷新：支持 LILISI API 自动登录获取 `subscribe_url`；未绑定群会继续使用 `.env` 里的旧全局账号作为兜底。

## 目录

```text
src/app/                    Next.js App Router 页面和 API
src/components/             前端组件
src/lib/db.ts               SQLite 表结构和数据操作
src/lib/upstream.ts         LILISI 自动刷新和临时链接抓取
src/lib/auth.ts             管理员登录 Cookie
src/lib/user-auth.ts        客户 QQ 登录 Cookie
data/paysys.sqlite          本地数据库，正式使用后要备份
.env                        本地密钥，不要发给别人
.env.example                环境变量模板
AGENTS.md                   给后续 Agent/Codex 读的维护说明
```

## 环境要求

建议云电脑安装：

- Node.js `20.19+` 或 Node.js `22 LTS`
- npm
- Windows PowerShell

当前项目用到 SQLite 原生依赖 `better-sqlite3`，Node 版本太旧时可能安装失败或有警告。

## 本地运行

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

打开：

- 后台：[http://localhost:3000/admin](http://localhost:3000/admin)
- 客户入口：[http://localhost:3000/portal](http://localhost:3000/portal)

如果没有设置 `ADMIN_PASSWORD`，本地开发默认密码是 `admin123`。正式使用前必须改掉。

## `.env` 配置

复制 `.env.example` 为 `.env` 后填写：

```env
ADMIN_PASSWORD=后台密码
ADMIN_SESSION_SECRET=随机长字符串
LILISI_EMAIL=你的 LILISI 账号
LILISI_PASSWORD=你的 LILISI 密码
PAYSYS_DB_PATH=./data/paysys.sqlite
```

说明：

- `ADMIN_PASSWORD`：后台登录密码，正式使用必须设置。
- `ADMIN_SESSION_SECRET`：Cookie 签名密钥，建议设置为随机长字符串。
- `LILISI_EMAIL` / `LILISI_PASSWORD`：自动刷新上游订阅时使用。
- `PAYSYS_DB_PATH`：数据库位置，默认是 `./data/paysys.sqlite`。

不要把 `.env` 发给别人，也不要提交到公开仓库。

## 云电脑部署

第一次部署：

```powershell
cd D:\path\to\PaySys
npm install
Copy-Item .env.example .env
notepad .env
npm run build
npm run start -- -p 3000
```

然后在云电脑浏览器打开：

```text
http://localhost:3000/admin
```

如果要让外部手机或客户访问，需要满足至少一个条件：

- 云电脑有公网 IP，并且放行 3000 端口。
- 或者使用反向代理、内网穿透、域名和 HTTPS。

正式对外建议使用 HTTPS。HTTP 能跑，但 Cookie 和后台密码在公网环境下不够稳妥。

## 云电脑重启后启动

桌面上有一个快捷方式：

```text
启动 PaySys
```

云电脑重启后，登录进桌面，双击这个快捷方式即可。它会自动检查并启动：

- PaySys 服务
- Cloudflare 隧道服务
- Bark 状态推送

如果快捷方式丢失，也可以打开 PowerShell，手动执行：

```powershell
cd D:\Desktop\Codex2026\PaySys
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\paysys-monitor.ps1 -ForceNotify
```

执行后会通过 Bark 推送当前客户页和后台页。只要云电脑不要关机，PaySys 和隧道就会继续在后台运行。

当前固定域名：

```text
客户页：https://paysys.suyehanzi.online/portal
后台页：https://paysys.suyehanzi.online/admin
```

Cloudflare Tunnel 已安装为 Windows 服务：

```powershell
Get-Service Cloudflared
Restart-Service Cloudflared
```

如果要查看服务启动命令：

```powershell
sc.exe qc Cloudflared
```

当前命名隧道配置里保留了 `edge-ip-version: auto`。如果 Cloudflared 重启后域名返回 `530`，优先确认这项仍在 `C:\Users\Administrator\.cloudflared\config.yml` 中，然后重启 `Cloudflared` 服务。

## 数据库备份

PaySys 的客户、付款、备注、VIP、上游账号和缓存信息都保存在本地 SQLite 数据库里。为避免云电脑被回收或磁盘损坏导致数据丢失，已配置加密备份流程：

- 备份脚本：`scripts/backup-paysys.ps1`
- 加密脚本：`scripts/backup-paysys.js`
- 恢复脚本：`scripts/restore-paysys-backup.js`
- 备份仓库：`D:\Desktop\Codex2026\PaySysBackups`
- GitHub 私有仓库：`suyehanzi/PaySysBackups`
- Windows 计划任务：`PaySys Database Backup`

备份文件位于备份仓库的 `backups/YYYY-MM/` 目录，格式为 `.sqlite.gz.enc`。备份内容使用 AES-256-GCM 加密，恢复口令不会提交到 GitHub。

手动备份：

```powershell
cd D:\Desktop\Codex2026\PaySys
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\backup-paysys.ps1
```

恢复到临时数据库文件：

```powershell
cd D:\Desktop\Codex2026\PaySys
node .\scripts\restore-paysys-backup.js D:\Desktop\Codex2026\PaySysBackups\backups\YYYY-MM\备份文件.sqlite.gz.enc .\data\restored-paysys.sqlite
```

恢复前应先停止 PaySys 服务，并确认恢复口令仍可用。不要把恢复口令、明文数据库或临时恢复库提交到 GitHub。

## 日常使用

1. 管理员打开 `/admin`。
2. 在“上游账号”里添加群名和对应 LILISI 账号，例如 `1群`、`2群`。
3. 客户自行打开 `/portal`，点“新用户申请”，填写昵称和 QQ。
4. 管理员在“注册申请”里选择群名并点“分配”，系统会创建未付款客户。
5. 后续需要补充或修改备注时，直接在客户列表的备注框里编辑，离开输入框后自动保存。
6. 客户付款后，在客户列表里登记续费，默认 `45` 元、`180` 天。
7. 点“复制文案”，把文案发到 QQ。
8. 客户打开 `/portal`，输入 QQ，点击“获取订阅”。
9. 客户复制 `/sub/[token]` 或扫码导入客户端。

VIP 客户可随时订阅，不受未登记或到期限制；禁用状态仍会拦截订阅。普通客户过期或禁用后，`/sub/[token]` 会返回错误，不返回真实订阅内容。

## 内部测试入口

后台的“内部测试”按钮会打开 `/admin/unlimited`。管理员可以选择 `1群`、`2群` 等群名，生成对应群的内部测试订阅链接和二维码。

这个测试链接不绑定具体客户，不统计客户拉取次数，也不会检查客户到期状态；它只适合管理员内部验证不同群的上游缓存。不要把内部测试链接发到群里。

## 后台记录

后台会保留客户获取订阅相关记录。客户列表里显示订阅拉取次数和最近拉取时间；页面下方的“最近获取记录”显示更完整的明细。

当前记录字段包括：

- 客户昵称、QQ、群名
- 动作类型：客户登录、获取入口、订阅拉取、刷新订阅等
- 发生时间
- IP
- 设备或客户端，例如 Clash、Stash、Shadowrocket、浏览器等

数据库会持续保存完整访问日志，后台页面默认展示最近 `500` 条。

## 常用命令

```powershell
npm run dev
npm run lint
npm test
npm run build
npm run start -- -p 3000
```

安全检查：

```powershell
npm audit --registry=https://registry.npmjs.org --audit-level=high
```

有些 npm 镜像不支持 audit，如果看到 `NOT_IMPLEMENTED`，用上面的官方 registry 参数。

## 备份

正式使用后，最重要的是数据库：

```text
data/paysys.sqlite
data/paysys.sqlite-wal
data/paysys.sqlite-shm
```

备份前最好先停掉服务，再复制整个 `data` 文件夹。

简单备份命令：

```powershell
Stop-Process -Name node -ErrorAction SilentlyContinue
Compress-Archive -Path data -DestinationPath "backup-paysys-data.zip" -Force
```

恢复时，把备份里的 `data` 文件夹放回项目根目录即可。

## 迁移到另一台云电脑

建议复制这些内容：

- `src`
- `package.json`
- `package-lock.json`
- `next.config.ts`
- `tsconfig.json`
- `eslint.config.mjs`
- `vitest.config.ts`
- `.env`
- `data`
- `README.md`
- `AGENTS.md`

不要复制 `node_modules` 和 `.next`，到新机器后重新执行：

```powershell
npm install
npm run build
npm run start -- -p 3000
```

## 注意事项

- 绑定了上游账号的群会使用独立订阅缓存；未绑定群会使用 `.env` 里的旧全局账号缓存。
- 后台绑定的上游账号密码会保存在本地 SQLite 数据库里，`data` 备份需要当作密钥文件保管。
- 系统能控制客户以后是否还能通过 `/sub/[token]` 获取订阅，但不能收回客户已经导入客户端的旧节点配置。
- 自动刷新依赖 LILISI 接口。如果账号密码错误、接口变化或风控出现，会保留旧缓存并记录错误。
- 当前客户登录只校验 QQ 号，适合你的小规模私域场景；如果以后用户变多，可以再加验证码或一次性口令。
- `/u/[token]` 是早期个人入口页面，当前推荐使用 `/portal` QQ 登录入口。
