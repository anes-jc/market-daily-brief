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

## まだ自動化しないもの

### 経済イベント

初期は固定の確認枠として扱います。将来、公式カレンダーまたは利用条件が明確な配信元を選びます。

### 関連ニュース

初期は本文取得・要約を行いません。将来RSSを使う場合も、保存するのは見出し・URL・出典・公開時刻に限定します。

## 運用ルール

- 必須データが欠損したら公開しない。
- 出典は記事内またはスナップショットJSONに残す。
- 銘柄推奨、売買判断、株価予想につながる表現は生成しない。
- データ取得元を変更する場合は `data-sources.md` と `config/market-data-sources.json` を同時に更新する。
