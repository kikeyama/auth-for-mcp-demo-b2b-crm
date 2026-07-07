# Known Issues

修正を見送った既知の問題を記録する。

---

## [UI] 活動詳細の「戻る」ボタンが遷移元を考慮しない

**日付**: 2026-07-06  
**優先度**: 低

### 現象

活動詳細画面（`/activities/[id]`）の「戻る」ボタンの遷移先が、遷移元ではなく活動データの内容によって決まる。

- `opportunity_id` があれば → 案件詳細（`/opportunities/[id]`）
- `opportunity_id` がなければ → 活動一覧（`/activities`）

顧客企業詳細から活動詳細を開いた場合でも、案件に紐づいていると案件詳細に飛んでしまう。

### 理想の挙動

遷移元に応じて戻り先を変える。

| 遷移元 | 戻り先 |
|---|---|
| 顧客企業詳細 | 顧客企業詳細 |
| 案件詳細 | 案件詳細 |
| 活動一覧 | 活動一覧 |

### 対応方針（未実施）

`activities/[id]/page.tsx` の「戻る」リンクを Client Component に切り出して `router.back()` を呼ぶ（A案）か、活動詳細へのリンクに `?from=<遷移元パス>` を付与して読み取る（B案）で対応できる。A案が変更箇所最小。

### 該当コード

`frontend/src/app/(dashboard)/activities/[id]/page.tsx`

```ts
const backHref = activity.opportunity_id
  ? `/opportunities/${activity.opportunity_id}`
  : '/activities';
```
