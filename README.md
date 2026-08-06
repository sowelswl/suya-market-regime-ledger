# 苏牙择时｜市场状态公开账本

这个仓库用于建立一条可以独立验证的事前（prospective）记录：每天约 20:00 生成下一交易日的市场状态后，先公开不可逆的 SHA-256 承诺；五个交易日后再揭示原始状态与随机 nonce。任何人都可以验证揭示内容是否与事前承诺一致。

它证明的是“某个时间点已经形成了什么市场状态”，不是对模型能力或未来收益的保证。

## 五档市场状态

- 强空
- 弱空
- 看平
- 弱多
- 强多

状态是市场判断，不是统一的仓位指令。风险暴露需要由每个使用者根据自身风险偏好进行映射。完整方法见 [METHODOLOGY.md](./METHODOLOGY.md)。

## 公开边界

仓库公开：

- 事前时间戳与 SHA-256 承诺
- 五个交易日后的原始状态揭示
- 独立验证工具
- 失败阶段、无效记录与修订说明

仓库不公开模型代码、实时信号、个人持仓或账户信息。`private/` 中的待揭示文件被 Git 忽略；它们应另行加密备份，否则丢失 nonce 后将无法完成揭示。

## 日常操作

要求 Node.js 20 或更高版本，不需要安装第三方依赖。

### 1. 生成事前承诺

```bash
node bin/prepare-signal.mjs \
  --signal-date 2026-08-07 \
  --generated-at 2026-08-06T20:00:00+08:00 \
  --state 弱多
```

命令会同时创建：

- `commitments/YYYY/MM/YYYY-MM-DD.json`：可以立即提交的公开承诺，不含状态与 nonce；
- `private/pending/YYYY-MM-DD.json`：本地待揭示文件，绝不能提交。

只提交 `commitments/` 中的新文件。已有日期不能覆盖。

### 2. 五个交易日后揭示

MVP 不内置交易所节假日日历，因此由操作者确认确实已经过去五个交易日：

```bash
node bin/reveal-signal.mjs \
  --signal-date 2026-08-07 \
  --confirm-five-trading-days
```

命令会校验本地待揭示文件，再写入 `reveals/YYYY/MM/YYYY-MM-DD.json`。原始私有文件不会被删除。

### 3. 独立验证

```bash
node bin/verify-signal.mjs \
  --commitment commitments/2026/08/2026-08-07.json \
  --reveal reveals/2026/08/2026-08-07.json
```

状态、生成时间或 nonce 的任何改变都会使验证失败。

### 4. 记录修订

原始承诺和揭示不得覆盖。数据缺失、计算失败或文字澄清只能追加到修订日志：

```bash
node bin/record-correction.mjs \
  --signal-date 2026-08-07 \
  --recorded-at 2026-08-08T09:00:00+08:00 \
  --original-commitment sha256:... \
  --action invalidate \
  --reason "发现数据源缺失，原记录标记为无效"
```

## 目录

```text
commitments/       事前公开的哈希承诺
reveals/           五个交易日后公开的原始状态
corrections/       只追加的无效与澄清记录
research-archive/  与前瞻账本严格分开的历史回溯研究
private/           本地待揭示文件，不进入 Git
bin/               生成、揭示、验证与修订命令
lib/               无依赖的核心实现
tests/             篡改、边界与文件行为测试
```

## 验证开发环境

```bash
npm test
```

历史回溯材料不会与事前记录混为同一类证据。详见 [research-archive/README.md](./research-archive/README.md)。

历史记录仅用于研究与交流，不构成投资建议，也不代表或保证未来表现。
