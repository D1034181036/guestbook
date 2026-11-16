# Google Sheets 留言簿

用 Google 試算表當後台的網站留言簿，不用架伺服器、不用資料庫。留言要在試算表勾選「審核通過」才會顯示，也可以直接在試算表回覆。

網站需要能放 HTML 和 JavaScript（GitHub Pages、Cloudflare Pages、Netlify、自架主機等）。

## 安裝

### 1. 複製試算表

打開 **[留言簿範本](https://docs.google.com/spreadsheets/d/1jnxDusMDILaMUhj3qN56NX44Eqj9f_9E7TWPb5KZ7D0/copy)**，按「建立副本」。

> 也可以自己建空白試算表，把 `Code.gs` 貼到「擴充功能 → Apps Script」，回到試算表重新整理後，點選單「💬 留言簿 → 初始化工作表」。

### 2. 部署

1. 試算表選單「擴充功能 → Apps Script」→ 右上角「部署 → 新增部署作業」→ 類型選「網頁應用程式」
2. 執行身分選「我」，誰可以存取選「所有人」，按部署並授權（出現「Google 尚未驗證這個應用程式」時點「進階 → 前往」）
3. 複製部署網址（結尾是 `/exec`），用瀏覽器打開，看到 `{"success":true,...}` 就成功了

之後改了程式碼，要到「部署 → 管理部署作業 → 編輯 → 版本：新版本」重新部署，網址不會變。

### 3. 放到網站

1. 把 `guestbook.js`、`guestbook.css` 放到網站，頁面引入：

   ```html
   <link rel="stylesheet" href="guestbook.css">
   <script defer src="guestbook.js"></script>
   ```

2. 把 `index.html` 裡的表單（`<form id="gb-form">`）和留言區（`<div id="gb-messages">`）貼到頁面
3. 把表單的 `action` 換成你的部署網址，送出和讀取留言都用這個網址

文字、placeholder 和樣式都能改，但 `gb-form`、`gb-messages` 這兩個 id，欄位的 `name`，以及 `gb-error`、`gb-success` 這兩個 class 不要改。

## 審核與回覆

- 新留言會加在試算表最下面，勾選「審核通過」才會顯示在網站上
- 在「回覆內容」寫回覆，「回覆時間」會自動填上當下時間
- 「回覆名稱」空白時顯示「站長回覆」，可以用留言區的 `data-reply-name` 改預設名稱
- 回覆內容可以用 HTML（連結、圖片）；訪客的留言一律當純文字顯示

## 選配

在 Apps Script「專案設定 → 指令碼屬性」新增：

- **Telegram 通知：** `TELEGRAM_BOT_TOKEN`、`TELEGRAM_CHAT_ID`，有新留言就會通知
- **Gist 加速：** `GIST_ID`、`GITHUB_TOKEN`（只需要 `gist` 權限）。審核或回覆後點「💬 留言簿 → 同步留言到 Gist」，並在留言區加上 `data-source="https://gist.githubusercontent.com/帳號/GistID/raw/guestbook.json"`

## 限制

- 名稱 50 字、網址 200 字、留言 1000 字，網址只接受 `http://` / `https://`，不能包含 `<a>` 標籤
- 沒開 JavaScript 的訪客可以留言（會開新分頁顯示結果），但看不到留言列表
