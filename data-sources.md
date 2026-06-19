# Market Daily Brief Data Sources

初期の実データ取得は、APIキーなしで始められる範囲に限定します。値は市場メモの材料として最小限に表示し、本文転載や投資助言につながる加工は行いません。

## 現在使う情報源

### Yahoo Finance chart endpoint

- 用途: 日経平均、S&P 500、NASDAQ、ドル円、米10年金利、WTI原油、金、TOPIX連動ETF
- 形式: JSON
- APIキー: 不要
- 実装: `scripts/fetch-market-data.mjs`
- 設定: `config/market-data-sources.json`

注意点:

- 公式APIとして契約利用するものではないため、取得失敗時は公開停止します。
- 記事では終値・前日比・出典名に留め、過度な再配信や詳細データ転載は避けます。
- TOPIX本指数の安定取得は未確定のため、当面は `1306.T` を「TOPIX連動ETF(1306)」として明示します。

## 次候補

### FRED

- 用途候補: 米10年金利、米国マクロ指標
- APIキー: 原則必要
- 公式ドキュメント: https://fred.stlouisfed.org/docs/api/fred/series_observations.html

FREDは公式性が高い一方、APIキー管理が必要です。次フェーズで導入する場合は GitHub Secrets にキーを保存し、失敗時は `NO_DATA` にします。

### Manual event calendar

- 用途: 本日のイベント欄
- 形式: JSON
- APIキー: 不要
- 実装: `scripts/load-events.mjs`
- 設定: `config/market-events.json`

初期版では公式カレンダーを自動取得せず、手動管理の固定JSONから読み込みます。日付指定イベントがあればそれを優先し、未登録日は平日/週末の確認枠を表示します。

注意点:

- 記事では予定を断定しすぎず「確認枠」として表示します。
- 個別イベントを追加する場合は `datedEvents` に日付、地域、時刻、タイトル、メモを追加します。
- 公式カレンダー連携は、利用条件と安定性を確認してから次フェーズで実装します。

### RSS headline links

- 用途: 関連ニュース欄
- 形式: RSS / Atom
- APIキー: 不要
- 実装: `scripts/fetch-news.mjs`
- 設定: `config/news-sources.json`
- 保存先: `data/news-digests/YYYY-MM-DD.json`

初期版では、RSS/Atomから見出し、URL、出典、公開時刻だけを取得します。本文取得、本文転載、AI要約は行いません。

現在の取得候補:

- NHK 経済ニュース RSS
- Federal Reserve monetary policy press releases RSS
- Federal Reserve speeches RSS

Yahoo Finance RSS と MarketWatch top stories RSS は、個別銘柄の買い判断・格付け・価格目標に近い見出しが混ざるため、初期標準ソースからは外しています。

注意点:

- 見出しリンク集として表示し、記事本文の代替になるような転載や要約は行いません。
- 禁止表現を含む見出しは表示対象から外します。英語見出しも大文字小文字を区別せずチェックします。
- RSS取得に失敗しても主要市場データが揃っていれば公開停止にはしません。失敗内容は `newsDigest.errors` に残します。

## まだ自動化しないもの

### 経済イベント

初期は固定JSONの確認枠として扱います。将来、公式カレンダーまたは利用条件が明確な配信元を選びます。

### ニュース本文・要約

ニュース本文取得とAI要約は行いません。将来追加する場合も、利用条件を確認し、引用量と出典表示を厳格に管理します。

## 運用ルール

- 必須データが欠損したら公開しない。
- 出典は記事内またはスナップショットJSONに残す。
- 銘柄推奨、売買判断、株価予想につながる表現は生成しない。
- データ取得元を変更する場合は `data-sources.md` と `config/market-data-sources.json` を同時に更新する。
