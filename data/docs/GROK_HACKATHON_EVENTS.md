# Grok 交付：追踪中的 Hackathon（hackathon_event）

2026-11-09 起，Lydia 侧栏「追踪 Hackathon」读取这类记录。

- 赛事尚未出结果时显示为黄色卡片，展示提交截止时间和剩余天数。
- 抓到 finalist 或获奖作品后，卡片变成绿色。

结果不写在赛事记录里，而是来自单独的作品记录（`hackathon_project`），每个作品都有自己的来源和审计记录。

## 交付方式

- 本地文件导入：在资料包 JSON 中增加 `events` 数组，也可以与 `projects`、`news` 放在同一个文件里。
- Drive 交付：ready.json 的 `files` 中可以增加一项 `{"kind":"events", ...}`，规则与 projects/news 相同：每种最多一份，单份不超过 10 MiB、10000 条，每条必须有长期不变的 `id`。

## 赛事字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `type` | 是 | 固定为 `hackathon_event` |
| `id` | 是（Drive 交付） | 长期不变的赛事 ID。作品通过 `event_id` 引用它 |
| `platform` | 是 | 平台名称。已知平台映射到 Lydia 的平台区；其他平台保留为可读标识 |
| `name` | 是 | 赛事名称 |
| `url` / `source_urls` | 是 | 至少一个公开链接，第一个视为赛事主页 |
| `submission_deadline` | 否 | ISO 8601，**必须带时区**，例如 `2026-11-23T23:59:00+08:00`。不带时区的会被拒收 |
| `deadline_note` | 否 | 官方没有写明截止时间时，写明原因。界面显示「待确认」，不会推算日期 |
| `event_dates` | 否 | 活动日期，原样展示，例如 `2026-11-05~07` |
| `match_names` | 否 | 作品 `event_and_date_evidence` 开头可能使用的其他赛事名称，用于关联已有作品 |
| `collected_date` / `collected_via` / `tags` / `verification_notes` | 否 | 与作品、新闻相同 |

## 作品如何关联到赛事

满足下列任一条件，作品即关联到赛事：

1. 作品记录带有 `"event_id": "<赛事 id>"`。推荐使用这种方式。
2. 作品与赛事属于同一平台，并且作品的 `event_and_date_evidence` 以赛事 `name` 或 `match_names` 中的某一项开头（忽略大小写和空白差异）。

关联作品中，`status` 为 Finalist 或 Winner 的才算结果。界面上以「上游声称」的形式展示，不当作已核实的获奖信息。没有关联到任何赛事、但带有赛事依据的 finalist/winner 作品，会按依据自动归组，卡片上标注「按作品归组」。

## 示例

```json
{
  "events": [
    {
      "type": "hackathon_event",
      "id": "ethglobal-bangkok-2026",
      "platform": "ETHGlobal",
      "name": "ETHGlobal Bangkok 2026",
      "source_urls": ["https://ethglobal.com/events/bangkok2026"],
      "submission_deadline": "2026-11-17T09:00:00+07:00",
      "event_dates": "2026-11-15~17",
      "collected_date": "2026-11-09"
    }
  ],
  "projects": [
    {
      "type": "hackathon_project",
      "id": "ethglobal-bangkok-2026-example",
      "event_id": "ethglobal-bangkok-2026",
      "platform": "ETHGlobal",
      "name": "Example Project",
      "idea": "…",
      "status": "Finalist (official)",
      "source_urls": ["https://ethglobal.com/showcase/example"]
    }
  ]
}
```

以上数据仅说明格式，示例中的赛事名称、日期和链接都不是真实信息。

## 更新与冲突

与作品、新闻相同：同一个 `id` 再次交付且内容完全一致时，记为 duplicate；内容有变化（例如截止日期延期）时，记为 conflict，并保留原记录不覆盖。赛事延期需要人工处理。用户可以在卡片上点「不再追踪」隐藏某个赛事。
