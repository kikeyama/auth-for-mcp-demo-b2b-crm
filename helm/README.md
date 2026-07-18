# NexusCRM Helm Charts

## 構成

```
helm/
└── charts/
    └── nexuscrm/            # 全サービスをまとめて管理するチャート
        ├── Chart.yaml
        ├── values.yaml      # 全サービスの定義（global デフォルト + services マップ）
        └── templates/
            ├── deployment.yaml      # range で全サービス分を生成
            ├── service.yaml         # range で全サービス分を生成（ClusterIP）
            ├── ingress.yaml         # ingress.enabled=true のサービスのみ生成
            └── job-db-init.yaml     # DB 初期化 Job（pre-install/pre-upgrade hook）
```

全サービスを **1 つの Helm Release** で管理します。サービスの追加・削除は `values.yaml` の `services:` マップを編集するだけです。

## 前提条件

- AWS Load Balancer Controller がクラスタにインストール済み
- ACM 証明書が有効
- 以下の Secret が対象 namespace に作成済み（「Secret の事前作成」参照）

## Secret の事前作成

機密値は **Helm が管理しません**。デプロイ前に `kubectl` で作成してください。

```bash
# DB 認証情報（ホストとパスワードのみ。ユーザー名・ポート・DB 名は values.yaml で管理）
kubectl create secret generic nexuscrm-db-secret \
  --namespace nexuscrm \
  --from-literal=host="<rds-endpoint>" \
  --from-literal=password="<password>"

# Auth0 設定
kubectl create secret generic nexuscrm-auth0-secret \
  --namespace nexuscrm \
  --from-literal=auth0-domain="<tenant>.auth0.com" \
  --from-literal=api-audience="https://api.nexuscrm.com" \
  --from-literal=frontend-client-id="<frontend-client-id>" \
  --from-literal=frontend-client-secret="<frontend-client-secret>" \
  --from-literal=auth0-secret="<32-char-random-string>" \
  --from-literal=mcp-client-id="<mcp-native-app-client-id>" \
  --from-literal=mcp-client-secret="<mcp-native-app-client-secret>"

# ALB 設定（subnets・security-groups・certificate-arn・host）
kubectl create secret generic nexuscrm-alb-secret \
  --namespace nexuscrm \
  --from-literal=subnets="<subnet-id-1>,<subnet-id-2>,<subnet-id-3>" \
  --from-literal=security-groups="<sg-id-1>,<sg-id-2>" \
  --from-literal=certificate-arn="arn:aws:acm:<region>:<account>:certificate/<id>" \
  --from-literal=frontend-host="nexuscrm.example.com" \
  --from-literal=mcp-host="nexuscrm-mcp.example.com"
```

**nexuscrm-db-secret**

| キー | 設定値 |
|---|---|
| `host` | RDS エンドポイント（ホスト名のみ） |
| `password` | DB ユーザーのパスワード |

**nexuscrm-auth0-secret**

| キー | 設定値 | 使用サービス |
|---|---|---|
| `auth0-domain` | `<tenant>.auth0.com`（スキームなし） | 全サービス |
| `api-audience` | `https://api.nexuscrm.com`（マイクロサービス共通の Auth0 API identifier。mcp では OBO token exchange のターゲット audience として `API_AUDIENCE` に注入） | 全サービス |
| `frontend-client-id` | frontend アプリの Client ID | frontend |
| `frontend-client-secret` | frontend アプリの Client Secret | frontend |
| `auth0-secret` | セッション暗号化用シークレット（32文字以上） `openssl rand -hex 32` で生成 | frontend |
| `mcp-client-id` | MCP サーバー用 Native アプリの Client ID（OBO token exchange 用） | mcp |
| `mcp-client-secret` | MCP サーバー用 Native アプリの Client Secret（OBO token exchange 用） | mcp |

**nexuscrm-alb-secret**

| キー | 設定値 |
|---|---|
| `subnets` | ALB を配置するサブネット ID（カンマ区切り） |
| `security-groups` | ALB に適用するセキュリティグループ ID（カンマ区切り） |
| `certificate-arn` | ACM 証明書の ARN |
| `frontend-host` | frontend の Ingress ホスト名 |
| `mcp-host` | mcp の Ingress ホスト名 |

> `DATABASE_URL` は Secret に持たず、`$(DATABASE_HOST)` / `$(DATABASE_PASSWORD)` を K8s env 補完で組み合わせて Deployment 内で構築する。ユーザー名 `nexuscrm`・ポート `5432`・DB 名 `nexuscrm` は values.yaml の `env.DATABASE_URL` テンプレートに直接記載。

> `DATABASE_URL` に `?sslmode=require&uselibpqcompat=true` を付与している理由: RDS はデフォルトで `rds.force_ssl=1`（SSL 接続のみ許可）が有効なため、`sslmode=require` が必要。ただし node-postgres の現バージョンでは `sslmode=require` が `verify-full` として動作し、AWS RDS CA が Node.js のデフォルト CA バンドルに含まれていないため `self-signed certificate in certificate chain` エラーになる。`uselibpqcompat=true` を追加すると libpq 本来の動作（SSL は使うが証明書検証はしない）になり接続できる。VPC 内部通信のため MITM リスクは許容範囲。証明書検証も行いたい場合は Dockerfile に AWS RDS CA バンドルを組み込み `NODE_EXTRA_CA_CERTS` で指定する。

> frontend の Auth0 設定（`AUTH0_DOMAIN`・`AUTH0_CLIENT_ID`・`AUTH0_CLIENT_SECRET`・`AUTH0_SECRET`・`AUTH0_AUDIENCE`）はすべて `nexuscrm-auth0-secret` から `secretEnv` で注入します。`@auth0/nextjs-auth0` v4 はこれらを実行時に `process.env.*` で読むため、ビルド時の焼き込みでは動作しません。サービス URL（`ACCOUNT_SERVICE_URL` 等）は `localhost:300x` へのフォールバックがあるため `env` で上書きします。

## デプロイ方法

```bash
helm upgrade --install nexuscrm ./charts/nexuscrm \
  --namespace nexuscrm \
  --create-namespace \
  --set-file dbInit.sql=../database/init.sql
```

### イメージタグの上書き

CI/CD で特定サービスのタグを指定する場合:

```bash
helm upgrade nexuscrm ./charts/nexuscrm \
  --namespace nexuscrm \
  --set-file dbInit.sql=../database/init.sql \
  --set services.account.image=222634407479.dkr.ecr.ap-northeast-1.amazonaws.com/nexuscrm-account:v1.2.3
```

### ⚠️ Docker イメージのビルド時は `--platform linux/amd64` を必須指定

EKS ノードは `amd64` だが、Apple Silicon Mac（`arm64`）で `docker build` するとホストのアーキテクチャ向けにしかビルドされない。`--platform` を指定せずに push すると、ECR 上のマニフェストに `amd64` 用のイメージが存在せず、Pod は `ImagePullBackOff` → `no match for platform in manifest: not found` で起動に失敗する。

```bash
docker build --platform linux/amd64 --provenance=false \
  -t 222634407479.dkr.ecr.ap-northeast-1.amazonaws.com/nexuscrm-<service>:<tag> \
  --push .
```

`--platform linux/amd64` を付けるとローカルの image store に読み込めない場合があるため、`--push` で直接 ECR に送るのが確実（`docker build` → `docker tag` → `docker push` の3ステップに分けない）。`--provenance=false` は任意だが、付けないと BuildKit が provenance attestation 用の manifest を自動生成し、ECR 上に「タグなしイメージ」が並んで見づらくなる（動作上の問題はない）。

push 後、Pod が古いタグのまま `ImagePullBackOff` になっている場合は再pull を明示的に促す:

```bash
kubectl rollout restart deployment/<service> -n nexuscrm
```

### テンプレートの確認（dry-run）

```bash
helm template nexuscrm ./charts/nexuscrm --namespace nexuscrm \
  --set-string "dbInit.sql=SELECT 1;"
```

> **注意**: `helm template` は `lookup` 関数をサポートしないため、ALB の Ingress アノテーション（subnets・security-groups・certificate-arn）が空になります。実際のデプロイでは `helm upgrade --install` を使用してください。

## values.yaml の構造

```yaml
global:          # 全サービス共通のデフォルト値
  replicas: 1
  containerPort: 3000
  resources: ...
  healthcheck:
    live: /healthz/live
    ready: /healthz/ready

dbInit:          # DB 初期化 Job 設定
  enabled: true
  image: postgres:16-alpine
  sql: ""        # --set-file dbInit.sql=../database/init.sql で注入
  secretName: nexuscrm-db-secret  # host / password を含む外部 Secret 名

services:        # サービスごとの定義
  account:
    image: ...              # 必須
    role: microservices
    secretEnv:              # 機密値を参照する secretKeyRef マップ（Helm は Secret を作成しない）
      DATABASE_HOST:
        secretName: nexuscrm-db-secret
        key: host
      DATABASE_PASSWORD:
        secretName: nexuscrm-db-secret
        key: password
    env:                    # 非機密の env vars。secretEnv より後に展開されるため $(VAR) 補完が使える
      PORT: "3000"
      ALLOWED_ORIGINS: "http://frontend:3000"
      DATABASE_URL: "postgresql://nexuscrm:$(DATABASE_PASSWORD)@$(DATABASE_HOST):5432/nexuscrm"
  frontend:
    image: ...
    healthcheck:            # global を上書き（frontend は /api/healthz/*)
      live: /api/healthz/live
      ready: /api/healthz/ready
    ingress:
      enabled: true
      host: nexuscrm.a0japan.solutions
    # env/secretEnv なし — ビルド時にイメージへ焼き込み済み
```

`global` の値はサービス側で同じキーを定義すると上書きされます（`dig` 関数による fallback）。

`secretEnv` の各エントリは Deployment の `env[].valueFrom.secretKeyRef` に展開されます。`secretName` は事前に `kubectl create secret` で作成した Secret 名、`key` はその Secret 内のキー名を指定します。Secret の値は values.yaml には書きません。

## DB 初期化 Job

`dbInit.enabled: true` のとき、`pre-install` / `pre-upgrade` hook として Deployment 作成前に実行されます。

- SQL は `--set-file dbInit.sql=../database/init.sql` で渡す（チャート内に SQL を持たない）
- `PGHOST` / `PGPASSWORD` は `dbInit.secretName` で指定した外部 Secret から取得
- `hook-delete-policy: before-hook-creation,hook-succeeded` により成功後は自動削除され、次回 upgrade 時に再実行される
- `database/init.sql` は `IF NOT EXISTS` で冪等なので再実行しても安全

### ⚠️ 初回 install 時の注意

DB 初期化 Job は `pre-install` hook として**通常リソースより先に実行**されます。参照する Secret は Helm 管理外のため、**デプロイ前の `kubectl create secret` が必須**です（「Secret の事前作成」参照）。

`helm upgrade`（2 回目以降）では既存の Secret を参照するため問題ありません。

## サービス種別と Ingress

| サービス | role ラベル | Ingress |
|---|---|---|
| account / opportunity / contact / activity / user | microservices | なし（クラスタ内部のみ） |
| frontend | なし | あり (`nexuscrm.a0japan.solutions`) |
| mcp | なし | あり (`nexuscrm-mcp.a0japan.solutions`) |

フロントエンドのヘルスチェックパスは `/api/healthz/live` / `/api/healthz/ready`（他は `/healthz/live` / `/healthz/ready`）。

## ⚠️ Pod ラベルと CNI Security Group

EKS の Security Groups for Pods（CNI）により、Pod ラベルに基づいて Security Group が割り当てられます。**以下のラベル名・値は変更しないでください。**

| ラベル | 値 | 対象リソース |
|---|---|---|
| `app` | `frontend` | frontend Pod |
| `app` | `mcp` | mcp Pod |
| `role` | `microservices` | マイクロサービス Pod（account / opportunity / contact / activity / user） |
| `role` | `db-job` | DB 初期化 Job Pod |

`app` ラベルは `values.yaml` の `services:` マップのキー名から自動生成されます。`frontend` / `mcp` のサービス名を変更する場合、または `role` 値を変更する場合は、対応する SecurityGroupPolicy の `podSelector` も合わせて更新してください。

`ALLOWED_ORIGINS` は各マイクロサービスの CORS ミドルウェアで使用し、許可するオリジン（カンマ区切り）を指定します。MCP サービスへのリクエスト元はブラウザではなく AI エージェントのため、MCP サービスには CORS 設定がなく `ALLOWED_ORIGINS` は不要です。
