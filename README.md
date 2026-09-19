# BOOKMARK HP V4 — Instagram Auto Sync

Instagram `@bookmark_nagano` の投稿を取得し、投稿画像をサイト側へ保存し、`public/data/events.json` を自動生成してHPへ反映する実装です。

## 重要：最初にトークンを再発行
今回の動作確認中、アクセストークンがスクリーンショットに表示されました。**V4の本番設定には、そのトークンを使わず、Meta App Dashboardで新しいトークンを発行してください。** トークンはHTMLやJavaScriptには絶対に書きません。

## 仕組み
1. `scripts/sync-instagram.mjs` が Instagram API の `/me/media` を取得
2. 投稿画像を `public/images/instagram/` にダウンロード（Instagram CDNをHPから直接参照し続けない）
3. キャプションからイベント名・日程・会場・地域・種別を抽出
4. `public/data/events.json` を更新
5. HPは `events.json` を読み込んでカードを自動表示
6. GitHub Actionsなら15分ごとに同期

## ローカル動作確認
`.env.example` を参考に環境変数 `INSTAGRAM_ACCESS_TOKEN` を設定してから：

```bash
npm run sync
npm run serve
```

ブラウザで `http://localhost:8080` を開きます。

## GitHub Pagesで自動運用する場合
1. このフォルダをGitHubリポジトリへアップロード
2. Repository Settings → Secrets and variables → Actions
3. `INSTAGRAM_ACCESS_TOKEN` というRepository secretを作り、**新しく発行したトークン**を保存
4. Actionsで `Sync Instagram to BOOKMARK` を一度手動実行
5. Pagesの公開元を `public/` に合わせる（公開方法に応じてActions deployへ変更してもOK）

## キャプションの推奨形
自動判定精度を上げるにはBOOKMARK投稿内に以下を含めます。

```text
イベント名
DATE｜2026.10.17 SAT
TIME｜14:15–15:15
PLACE｜長野大学 体育館
TYPE｜SHOWCASE
```

今までの投稿形式でも日付・地域・種別を可能な範囲で推定し、足りない項目は「要確認」にします。

## 現在のV4の考え方
- Instagramを「入力元」にする
- HPでトークンを公開しない
- Instagram画像URLを直接ホットリンクし続けず、同期時にBOOKMARK側へ保存する
- Instagram Media IDをイベントIDとして扱うので、同じ投稿を二重登録しない
- キャプション解析はルールベース。今後AI解析や管理画面を追加可能
