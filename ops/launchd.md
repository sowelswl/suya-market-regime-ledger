# macOS 定时发布

正式定时任务使用一个独立运行副本，不复用日常开发工作区，避免人在功能分支上工作时阻断发布。

- 周一（Monday）到周五（Friday）20:05 执行；
- `launchd` 的 `Weekday` 使用 cron 编号：周一到周五必须是 `1` 到 `5`，不能写成 `2` 到 `6`；
- 20:20 与 20:40 运行 `verify-daily-publication.sh`，核对本地文件、GitHub 公开证据、外部存证与网页数据；
- 个人主页 `/ledger/` 直接读取仓库中的公开 JSON，不需要为每天的新信号重新部署网页；
- 巡检读取 `raw.githubusercontent.com` 上的 `docs/data/index.json`，确认当天承诺已经可供普通浏览器访问；
- 从 `$HOME/.secrets/shared.env` 读取当前数据库配置；
- 私有 reveal 默认保存在 `$HOME/.secrets/suya-market-regime-ledger`；
- 配置文件不包含密码，也不写入任何密码或 token；
- Publisher 只暂存 `commitments`、`reveals` 和由公开数据构建的 `docs`，不会提交其他工作区改动；
- 数据库当天没有新鲜记录时失败关闭，不沿用旧信号。
- 数据库没有更新或 Publisher 未运行时，20:05 发布器会失败，20:20/20:40 巡检也会因当天承诺缺失而通知；
- GitHub 推送失败会在发布阶段立即通知，巡检还会通过远端承诺缺失再次发现；
- 未捕获的同步、存证或公开 JSON 错误统一写入本地错误日志并弹出 macOS 通知，不在通知中包含凭据。
- LaunchAgent 通过 `SUYA_NODE_BIN` 和 `SUYA_NPM_BIN` 固定使用 Homebrew `node@24`，避免 Homebrew 运行库升级后继续调用失效的旧 Node。
- 每日发布与两次巡检都必须经过 Healthchecks wrapper；Healthchecks 监控任务是否运行，本机通知报告发布成功或具体失败阶段。

运行副本建议放在 `$HOME/.local/share/suya-market-regime-ledger/repo`，日志放在 `$HOME/.local/state/suya-market-regime-ledger`。发布 LaunchAgent 调用 `ops/publish-daily.sh`，巡检 LaunchAgent 调用 `ops/verify-daily-publication.sh`；两者都通过环境变量 `SUYA_LEDGER_REPO` 指向该副本。

本机按当前约定持续保持开机且不休眠。长期运行若迁移到能够访问 `PG_NAS` 的常在线主机，仍可复用同一脚本与仓库外私有目录。

首次安装或修复基础 LaunchAgent 时运行 `ops/install-launchd.sh`。随后使用 `suyadingshi-macos` 为两个任务创建 Healthchecks checks 和 wrappers，并以 `--apply-launchd` 应用；不要在 wrapper 应用后再次运行基础安装脚本，否则会把 wrapper 还原为直接调用原脚本。
