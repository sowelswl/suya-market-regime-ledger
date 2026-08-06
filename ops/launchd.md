# macOS 定时发布

正式定时任务使用一个独立运行副本，不复用日常开发工作区，避免人在功能分支上工作时阻断发布。

- 周一（Monday）到周五（Friday）20:05 执行；
- 从 `$HOME/.secrets/shared.env` 读取当前数据库配置；
- 私有 reveal 默认保存在 `$HOME/.secrets/suya-market-regime-ledger`；
- 配置文件不包含密码，也不写入任何密码或 token；
- Publisher 只暂存 `commitments` 和 `reveals`，不会提交其他工作区改动；
- 数据库当天没有新鲜记录时失败关闭，不沿用旧信号。

运行副本建议放在 `$HOME/.local/share/suya-market-regime-ledger/repo`，日志放在 `$HOME/.local/state/suya-market-regime-ledger`。LaunchAgent 调用 `ops/publish-daily.sh`，通过环境变量 `SUYA_LEDGER_REPO` 指向该副本。

定时任务不能保证睡眠或关机中的 Mac 准时执行。长期运行应迁移到能够访问 `PG_NAS` 的常在线主机；迁移时仍复用同一脚本与仓库外私有目录。
