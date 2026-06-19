# Market Daily Brief Data Sources

初期の実データ取得は、APIキーなしで始められる範囲に限定します。値は市場メモの材料として最小限に表示し、本文転載や投資助言につながる加工は行いません。

## 現在使う情報源

### Yahoo Finance chart endpoint

- 用途: 日経平均、S&P 500、NASDAQ、ドル円、WTI原油、金、TOPIX連動ETF
- 形式: JSON
- APIキー: 不要
- 実装: `scripts/fetch-market-data.mjs`
- 設定: `config/market-data-sources.json`

注意点:

- 公式APIとして契約利用するものではないため、取得失敗時は公開停止します。
- `requestTimeoutMs` を超える取得は失敗扱いにします。
- 必須データが `maxDataAgeDays` を超えて古い場合は `NO_DATA` として公開停止します。
- WTI原油と金は補助データのため、取得失敗しても公開停止にはしません。
- 記事では終値・前日比・出典名に留め、過度な再配信や詳細データ転載は避けます。
- TOPIX本指数の安定取得は未確定のため、当面は `1306.T` を「TOPIX連動ETF(1306)」として明示します。`世界の株価と日経先物` は数値の自動取得元ではなく、読者向けの補助確認リンクとして扱います。

### FRED

- 用途: 米10年金利
- 形式: 公開CSV
- APIキー: 不要
- 実装: `scripts/fetch-market-data.mjs`
- 設定: `config/market-data-sources.json`
- 取得URL: `https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10`
- 系列ページ: https://fred.stlouisfed.org/series/DGS10

米10年金利はYahoo Financeの `^TNX` が古い値を返すことがあるため、FREDのDGS10公開CSVを使います。

## 次候補

### FRED API

FRED APIを使って米国マクロ指標を増やす場合は、GitHub Secrets にキーを保存し、失敗時の公開停止条件を個別に決めます。

### Official event calendar

- 用途: 本日のイベント欄
- 形式: ICS / HTML
- APIキー: 不要
- 実装: `scripts/fetch-events.mjs`
- 設定: `config/event-sources.json`
- 保存先: `data/event-digests/YYYY-MM-DD.json`

現在の取得元:

- BLS Economic News Release Schedule ICS: `https://www.bls.gov/schedule/news_release/bls.ics`
- BEA Release Schedule: `https://www.bea.gov/news/schedule`
- Federal Reserve FOMC calendars: `https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm`
- Bank of Japan Monetary Policy Meetings: `https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm`

注意点:

- 日付、時刻、イベント名、出典URLだけを取得します。予想値、結果値、解説、投資判断は取得しません。
- BLSとBEAは米東部時間の予定を日本時間に換算します。
- Fed FOMC会合日程は公式ページの日付を米国時間ベースの会合日として表示します。
- 日銀MPM関連は日本時間の日付として表示します。
- 対象日の公式イベントが見つからない場合は `config/market-events.json` の手動確認枠へフォールバックします。
- イベント取得に失敗しても、市場データが揃っていれば公開停止にはしません。失敗内容は `eventDigest.errors` に残します。

### Manual event fallback

- 用途: 公式イベントがない日または取得失敗時の確認枠
- 形式: JSON
- APIキー: 不要
- 実装: `scripts/load-events.mjs`
- 設定: `config/market-events.json`

日付指定イベントがあればそれを優先し、未登録日は平日/週末の確認枠を表示します。

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
- 外部リンクは出典確認用として扱い、記事本文、画像、本文要約、埋め込み表示は行いません。

## まだ自動化しないもの

### 経済イベント

公式カレンダー連携済みです。日本の経済統計、財務省、内閣府などの国内イベントはまだ自動連携していません。

### ニュース本文・要約

ニュース本文取得とAI要約は行いません。将来追加する場合も、利用条件を確認し、引用量と出典表示を厳格に管理します。

## 運用ルール

- 必須データが欠損したら公開しない。
- 出典は記事内またはスナップショットJSONに残す。
- 銘柄推奨、売買判断、株価予想につながる表現は生成しない。
- データ取得元を変更する場合は `data-sources.md` と `config/market-data-sources.json` を同時に更新する。
