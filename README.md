# 苏牙择时｜市场状态公开账本

[公开前端](https://weilisong.com/suya-market-regime-ledger/)面向普通读者展示五档市场状态、承诺状态和验证结果；使用前端不需要 GitHub 账号。这个仓库保留原始证据、独立验证工具和发布代码。

账本建立一条可以独立验证的事前（prospective）记录：每天约 20:00 从 `signal_db.public.jq_time_series_signal_daily` 读取策略 `ret_trend_lev_ma_5level_calendar` 版本 `3.2` 的最新五档 `prediction`（参数哈希 `98bc3197708958de`，标的 `IC.CFE`），先公开隐藏状态的密码学承诺；五个交易日（以五个后续交易观测日计）后再揭示原始状态与随机 nonce。

它证明的是“某个公开时间点已经形成了什么市场状态”，不是对模型能力或未来收益的保证。

当前评价口径已冻结为 [《择时信号评价方法 v1.2》](./EVALUATION_V1_2.md)：每天一条信号，只预测下一交易日的大盘方向。公开统计固定以中证500（000905）作为主代理，并以沪深300、中证1000、中证2000和上证指数作同口径辅助验证。少于 20 条已揭示记录时不发布胜率结论；[v1.1](./EVALUATION_V1_1.md) 与 v1.0 继续作为历史规则保留。

每条记录揭示后，公开前端会同时显示该信号所预测的下一交易日里，中证500、沪深300、中证1000、中证2000和上证指数的实际涨跌幅。它们是独立读取的事后市场结果，不属于事前 commitment 的哈希内容；页面会把“事前状态验证”和“事后行情对照”明确分开。

事后市场结果不属于事前承诺，也不会参与原 commitment 的哈希验证。

公开范围遵循 [《公开窗口与历史评价发布规则 v1》](./PUBLICATION_POLICY_V1.md)：页面和仓库当前视图只保留最近 20 个交易日的信号窗口；完整历史只公开聚合评价和数据快照哈希，不公开逐日信号序列。

## 五档市场状态

| 数据库 level | 公开状态 | 风险暴露倾向 |
|---:|---|---|
| -2 | 强空 | 接近空仓；可极轻微空头 |
| -1 | 弱空 | 降低多头，默认不做空 |
| 0 | 看平 | 很轻微的多头 |
| 1 | 弱多 | 适度多头 |
| 2 | 强多 | 相对较高的多头 |

五档仓位结构整体右偏，以多头暴露为主要收益来源；空档首先用于规避风险，只有强空允许极轻微空头。上表不是统一仓位比例，实际风险暴露仍由使用者根据自身风险偏好映射。完整方法见 [METHODOLOGY.md](./METHODOLOGY.md)。

## 防止事后修改

1. 状态、时间、链式前序承诺和 256 位随机 nonce 按 [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) 生成 canonical JSON。
2. 对 UTF-8 字节计算 SHA-256；公开 commitment 不包含状态和 nonce，五种状态无法被直接枚举。
3. 每条记录保存上一条 commitment，删除或插入记录会破坏链条。
4. GitHub Actions 使用 Sigstore 签名，并把证明写入 Rekor 透明日志。Git 历史不是唯一的时间依据。
5. 揭示后，公开前端在访问者浏览器中重新计算哈希。

SHA-256 能锁定内容，Sigstore / Rekor 用来提供仓库身份和外部时间见证。两者都不能把历史回溯变成事前证据，所以本账本不回填历史承诺。

## 公开边界

仓库公开：

- 事前 commitment、来源观察日期和发布者声明时间；
- 五个后续交易观测日后的状态、level 与 nonce；
- 已揭示信号所对应下一交易日的五个宽基实际收益；
- Sigstore / Rekor 证明和浏览器验证结果；
- 失败阶段、无效记录与只追加修订。
- 全历史聚合评价、样本范围与不含原始行的快照哈希。

仓库不公开模型代码、完整逐日历史信号、个人持仓、数据库凭据或账户信息。待揭示 payload 和窗口外完整历史必须存放在仓库外、权限受限的私有目录；`.gitignore` 仍排除 `private/`，作为第二道防线。

## 数据库自动生成

数据库凭据只通过进程环境提供，代码使用 `PG_NAS_HOST`、`PG_NAS_PORT`、`PG_NAS_USER` 和 `PG_NAS_PASSWORD`，不会读取 admin 或 DDL 凭据。查询始终包在 `BEGIN READ ONLY` 事务中。

实时 commitment 和到期揭示日历从 `signal_db` 读取。历史评价同样从该表读取五档 prediction，再按交易日连接 `aistk` 中的中证500、沪深300收益，以及 `cn_stock_db` 中的中证1000、中证2000和上证指数收盘价；三个连接分别使用只读事务。2026-08-07 之前已生成的 commitment 保留原来源标识并继续按原哈希验证，不会被改写成新来源。

```bash
export LEDGER_PRIVATE_ROOT="$HOME/.secrets/suya-market-regime-ledger"

node bin/publish-from-database.mjs \
  --expected-as-of-date 2026-08-05
```

命令会验证日期、五档 level/label 映射和现有哈希链，然后创建：

- `commitments/YYYY/MM/YYYY-MM-DD.json`：可以立即公开，不含状态与 nonce；
- `$LEDGER_PRIVATE_ROOT/pending/YYYY-MM-DD.json`：权限为 `600` 的待揭示 payload，绝不能提交。

同一日期的文件使用独占写入，重复执行不会覆盖原记录。

## 手动生成与揭示

手动入口只用于恢复和测试，正常运行应使用数据库 Publisher。

```bash
node bin/prepare-signal.mjs \
  --private-root "$LEDGER_PRIVATE_ROOT" \
  --as-of-trade-date 2026-08-05 \
  --committed-at 2026-08-05T20:00:00+08:00 \
  --source-generated-at 2026-08-05T19:31:14+08:00 \
  --signal-level 1 \
  --signal-label 弱多
```

五个后续交易观测日后：

```bash
node bin/reveal-signal.mjs \
  --private-root "$LEDGER_PRIVATE_ROOT" \
  --as-of-trade-date 2026-08-05 \
  --confirm-five-observations
```

独立命令行验证：

```bash
node bin/verify-signal.mjs \
  --commitment commitments/2026/08/2026-08-05.json \
  --reveal reveals/2026/08/2026-08-05.json
```

状态、时间、链式前序或 nonce 的任何改变都会使验证失败。

## 记录修订

原始承诺和揭示不得覆盖。数据缺失、计算失败或文字澄清只能追加：

```bash
node bin/record-correction.mjs \
  --as-of-trade-date 2026-08-05 \
  --recorded-at 2026-08-08T09:00:00+08:00 \
  --original-commitment sha256:... \
  --action invalidate \
  --reason "发现数据源缺失，原记录标记为无效"
```

## 目录

```text
commitments/       事前公开的哈希承诺
reveals/           延迟公开的原始状态
corrections/       只追加的无效与澄清记录
research-archive/  与前瞻账本严格分开的历史回溯研究
site/              面向非 GitHub 用户的静态前端
docs/              从 site/ 生成并供个人主页读取的公开快照
bin/               数据库生成、揭示、验证与构建命令
lib/               canonical JSON、哈希链、数据库和文件边界
tests/             篡改、隐私、只读读取、前端与部署测试
```

## 验证开发环境

```bash
npm ci
npm test
npm run build:site
npm run build:pages
```

历史回溯材料不会与事前记录混为同一类证据。详见 [research-archive/README.md](./research-archive/README.md)。

历史记录仅用于研究与交流，不构成投资建议，也不代表或保证未来表现。
