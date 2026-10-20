# macOS 定时发布

正式发布使用一个独立运行副本，不复用日常开发工作区。机器按当前约定持续开机且不休眠。

## 本机确定性发布

- 只安装一个 LaunchAgent：`com.suya.market-regime-ledger`；
- 周一（Monday）到周五（Friday）北京时间 20:10 执行 `ops/publish-with-retry.sh`；
- `launchd` 的 `Weekday` 使用 cron 编号，周一到周五是 `1` 到 `5`；
- 如果数据库尚未产生当天信号，只对“信号尚未更新”这一种错误每 300 秒重试一次，最晚到 20:40；
- 其他数据库、Git、Node 或脚本错误立即失败，不会被重试掩盖；
- 不沿用旧信号，不补写错过的事前承诺；
- 通过 `SUYA_NODE_BIN` 和 `SUYA_NPM_BIN` 固定使用 Homebrew `node@24`；
- 从 `$HOME/.secrets/shared.env` 读取数据库配置，LaunchAgent 配置文件不包含密码，也不写入密码或 token；
- 私有 reveal 保存在 `$HOME/.secrets/suya-market-regime-ledger`；
- Publisher 只暂存和提交公开证据文件，不会提交运行副本中的其他改动；
- Publisher 在权限受限的临时副本中生成、揭示和构建；数据库或构建中断不会把半成品留在运行副本中，失败现场保留在日志指明的私有目录。完整快照通过后才保存私有揭示、快进合入并推送；
- 同日再次执行复用已经存在的承诺，不覆盖原哈希与私有揭示。推送失败仍需独立审计核对实际公开时间，不能把迟到发布视为原日期的事前证明；
- `research-archive/retrospective-request.json` 只登记经用户要求补录的日期；每日刷新其公开窗口与五个后续观测日门槛。补录数据在独立字段中展示，不加入 commitment 链；
- 不使用 Healthchecks，也不恢复原来的 watchdog LaunchAgent。

运行副本位于 `$HOME/.local/share/suya-market-regime-ledger/repo`，日志位于 `$HOME/.local/state/suya-market-regime-ledger`。首次安装或修复时运行 `ops/install-launchd.sh`。

## Codex 独立审计

工作日 20:45 由独立的 Codex 审计任务运行 `ops/verify-daily-publication.sh`。Codex 不生成或修改承诺，只检查：

- 运行副本为 `main` 且干净；
- 当天承诺已推送到 GitHub `main`；
- `Verify ledger tools` 与 `Attest public ledger evidence` 成功；
- `raw.githubusercontent.com` 的公开 JSON 包含当天记录；
- `https://weilisong.com/ledger/` 使用的公开数据源能够读取当天记录。

这样即使 Codex 模型额度或审计任务暂时不可用，本机发布仍然独立完成；审计失败只影响通知，不影响事前承诺本身。
