const KNOWN_SOURCE_NAMES = new Set([
  "aistk.public.micro_timing_final_tail_hold_dates:trend5mcx",
  "signal_db.public.jq_time_series_signal_daily:ret_trend_lev_ma_5level_calendar@3.2#98bc3197708958de:IC.CFE",
])

export function canonicalize(value) {
  if (value === null) return "null"
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value)
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON numbers must be finite")
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`
  if (typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => {
      if (value[key] === undefined) throw new TypeError("Invalid JSON value")
      return `${JSON.stringify(key)}:${canonicalize(value[key])}`
    }).join(",")}}`
  }
  throw new TypeError("Invalid JSON value")
}

function canonicalReveal(reveal) {
  return {
    schema_version: "2.0",
    sequence: reveal.sequence,
    previous_commitment: reveal.previous_commitment,
    source: reveal.source,
    as_of_trade_date: reveal.as_of_trade_date,
    prediction_horizon: "next_trading_session",
    committed_at: reveal.committed_at,
    source_generated_at: reveal.source_generated_at,
    signal_level: reveal.signal_level,
    signal_label: reveal.signal_label,
    nonce: reveal.nonce,
  }
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export async function verifyReveal(commitment, reveal) {
  try {
    if (!commitment || !reveal) return false
    if (commitment.source !== reveal.source || !KNOWN_SOURCE_NAMES.has(reveal.source)) return false
    for (const field of ["sequence", "previous_commitment", "as_of_trade_date", "prediction_horizon", "committed_at", "source_generated_at"]) {
      if (commitment[field] !== reveal[field]) return false
    }
    const digest = await sha256Hex(canonicalize(canonicalReveal(reveal)))
    return commitment.commitment === `sha256:${digest}`
  } catch {
    return false
  }
}

function text(selector, value) {
  const element = document.querySelector(selector)
  if (element) element.textContent = value
}

function formatDate(value) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(`${value}T00:00:00+08:00`))
}

function formatPercent(value, digits = 1) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "—"
}

function appendTable(parent, rows, columns, label) {
  const wrapper = document.createElement("div")
  wrapper.className = "evaluation-table-wrap"
  const table = document.createElement("table")
  table.className = "evaluation-table"
  table.setAttribute("aria-label", label)
  const head = document.createElement("thead")
  const headRow = document.createElement("tr")
  for (const column of columns) {
    const cell = document.createElement("th")
    cell.scope = "col"
    cell.textContent = column.label
    headRow.append(cell)
  }
  head.append(headRow)
  const body = document.createElement("tbody")
  for (const row of rows) {
    const tableRow = document.createElement("tr")
    for (const column of columns) {
      const cell = document.createElement("td")
      cell.textContent = column.value(row)
      tableRow.append(cell)
    }
    body.append(tableRow)
  }
  table.append(head, body)
  wrapper.append(table)
  parent.append(wrapper)
}

function renderEvaluation(report) {
  const container = document.querySelector("#evaluation-benchmarks")
  if (!container) return
  if (!report?.benchmarks || !report?.scope) {
    container.textContent = "历史聚合评价暂不可用"
    return
  }

  text("[data-evaluation-observations]", String(report.scope.observations))
  text("[data-evaluation-range]", `${formatDate(report.scope.first_signal_date)} — ${formatDate(report.scope.last_evaluated_signal_date)}`)
  text("[data-evaluation-policy]", `v${report.policy_version}`)
  container.replaceChildren()

  for (const benchmark of Object.values(report.benchmarks)) {
    const card = document.createElement("article")
    card.className = "benchmark-card"
    const title = document.createElement("h3")
    title.textContent = benchmark.label
    const role = document.createElement("p")
    role.className = "benchmark-role"
    role.textContent = benchmark.role === "primary" ? "固定主统计代理" : "宽基辅助验证"

    const metrics = document.createElement("dl")
    metrics.className = "benchmark-metrics"
    for (const [label, value] of [
      ["样本", String(benchmark.overall.observations)],
      ["方向命中", formatPercent(benchmark.overall.direction_hit_rate)],
      ["平均次日收益", formatPercent(benchmark.overall.mean_next_day_return, 2)],
    ]) {
      const item = document.createElement("div")
      const term = document.createElement("dt")
      term.textContent = label
      const description = document.createElement("dd")
      description.textContent = value
      item.append(term, description)
      metrics.append(item)
    }
    card.append(title, role, metrics)

    appendTable(
      card,
      benchmark.by_state.filter((state) => state.published),
      [
        { label: "状态", value: (row) => row.label },
        { label: "样本", value: (row) => String(row.observations) },
        { label: "方向命中", value: (row) => formatPercent(row.direction_hit_rate) },
        { label: "平均次日", value: (row) => formatPercent(row.mean_next_day_return, 2) },
      ],
      `${benchmark.label}五档历史聚合评价`,
    )

    const annual = benchmark.by_year.filter((year) => year.published)
    if (annual.length > 0) {
      const details = document.createElement("details")
      details.className = "annual-details"
      const summary = document.createElement("summary")
      summary.textContent = "查看年度聚合"
      details.append(summary)
      appendTable(
        details,
        annual,
        [
          { label: "年度", value: (row) => String(row.year) },
          { label: "样本", value: (row) => String(row.observations) },
          { label: "方向命中", value: (row) => formatPercent(row.direction_hit_rate) },
          { label: "平均次日", value: (row) => formatPercent(row.mean_next_day_return, 2) },
        ],
        `${benchmark.label}年度历史聚合评价`,
      )
      card.append(details)
    }
    container.append(card)
  }
}

function renderHistory(records, verifiedDates) {
  const list = document.querySelector("#history-list")
  if (!list || records.length === 0) return
  list.replaceChildren()

  for (const record of records) {
    const row = document.createElement("article")
    row.className = "history-record"

    const sequence = document.createElement("span")
    sequence.className = "record-sequence"
    sequence.textContent = `#${String(record.commitment.sequence).padStart(3, "0")}`

    const date = document.createElement("time")
    date.className = "record-date"
    date.dateTime = record.commitment.as_of_trade_date
    date.textContent = formatDate(record.commitment.as_of_trade_date)

    const state = document.createElement("div")
    state.className = "record-state"
    const stateTitle = document.createElement("strong")
    stateTitle.textContent = record.reveal?.signal_label ?? "状态尚未揭示"
    const digest = document.createElement("small")
    digest.textContent = `${record.commitment.commitment.slice(0, 18)}…`
    state.append(stateTitle, digest)

    const status = document.createElement("span")
    status.className = `record-status ${verifiedDates.has(record.commitment.as_of_trade_date) ? "verified" : ""}`
    status.textContent = record.reveal
      ? (verifiedDates.has(record.commitment.as_of_trade_date) ? "验证通过" : "验证失败")
      : "等待揭示"

    row.append(sequence, date, state, status)
    list.append(row)
  }
}

async function render(data) {
  const records = Array.isArray(data.records) ? data.records : []
  renderEvaluation(data.historical_evaluation)
  const verifiedDates = new Set()
  for (const record of records) {
    if (record.reveal && await verifyReveal(record.commitment, record.reveal)) {
      verifiedDates.add(record.commitment.as_of_trade_date)
    }
  }

  text("[data-record-count]", String(records.length))
  text("[data-revealed-count]", String(records.filter((record) => record.reveal).length))
  text("[data-verified-count]", String(verifiedDates.size))
  renderHistory(records, verifiedDates)

  const latest = records[0]
  if (!latest) return

  const verified = verifiedDates.has(latest.commitment.as_of_trade_date)
  const pill = document.querySelector("[data-status-pill]")
  if (pill) {
    pill.textContent = verified ? "验证通过" : (latest.reveal ? "验证失败" : "等待揭示")
    pill.dataset.status = verified ? "verified" : "pending"
  }
  text("[data-record-sequence]", `#${String(latest.commitment.sequence).padStart(3, "0")}`)
  text("[data-latest-state]", latest.reveal?.signal_label ?? "密")
  text("[data-latest-title]", latest.reveal ? "原始状态已经公开" : "事前承诺已经锁定")
  text(
    "[data-latest-description]",
    latest.reveal
      ? (verified ? "浏览器已重新计算 SHA-256，揭示内容与事前承诺完全一致。" : "揭示内容与事前承诺不一致，请停止引用该记录。")
      : "市场状态与随机 nonce 尚未公开；五个后续交易观测日后自动揭示。",
  )
  text("[data-as-of-date]", formatDate(latest.commitment.as_of_trade_date))
  text("[data-proof-status]", latest.reveal ? (verified ? "SHA-256 验证通过" : "验证失败") : "承诺已生成")
  text("[data-verifier-demo]", verifiedDates.size > 0 ? `${verifiedDates.size} 条记录验证通过` : "等待可验证记录")
}

async function boot() {
  try {
    const response = await fetch("./data/index.json", { cache: "no-store" })
    if (!response.ok) throw new Error("Unable to load ledger data")
    await render(await response.json())
  } catch {
    const pill = document.querySelector("[data-status-pill]")
    if (pill) pill.textContent = "数据暂不可用"
  }
}

if (typeof document !== "undefined") boot()
