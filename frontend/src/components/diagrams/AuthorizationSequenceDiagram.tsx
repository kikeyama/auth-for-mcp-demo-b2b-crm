const LANE_X = { client: 110, mcp: 400, auth0: 690 };
const WIDTH = 760;
const HEIGHT = 580;

function Lane({ x, label }: { x: number; label: string }) {
  return (
    <>
      <rect x={x - 75} y={10} width={150} height={34} rx={8} className="fill-gray-900" />
      <text x={x} y={32} textAnchor="middle" className="fill-white text-[12px] font-bold">
        {label}
      </text>
      <line x1={x} y1={44} x2={x} y2={HEIGHT - 15} stroke="#d1d5db" strokeDasharray="4 3" strokeWidth={1.5} />
    </>
  );
}

function Arrow({ fromX, toX, y, label, dashed }: { fromX: number; toX: number; y: number; label: string; dashed?: boolean }) {
  const dir = toX > fromX ? 1 : -1;
  return (
    <g>
      <foreignObject x={Math.min(fromX, toX)} y={y - 20} width={Math.abs(toX - fromX)} height={18}>
        <div className="text-[11px] text-gray-600 text-center leading-tight font-mono">{label}</div>
      </foreignObject>
      <line
        x1={fromX}
        y1={y}
        x2={toX - dir * 8}
        y2={y}
        stroke="#4b5563"
        strokeWidth={1.5}
        strokeDasharray={dashed ? '4 3' : undefined}
        markerEnd="url(#seq-arrowhead)"
      />
    </g>
  );
}

function StepBadge({ y, step }: { y: number; step: number }) {
  return (
    <g>
      <circle cx={20} cy={y} r={11} className="fill-gray-900" />
      <text x={20} y={y + 4} textAnchor="middle" className="fill-white text-[11px] font-bold">
        {step}
      </text>
    </g>
  );
}

// MCP仕様の Authorization Server Discovery Sequence Diagram
// (https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization#authorization-server-discovery-sequence-diagram)
// を、このMCPサーバーが実際に通る経路（401のWWW-Authenticateに resource_metadata を
// 常に含む）に単純化したもの。①②③は下記セクション1〜3に対応する。
export function AuthorizationSequenceDiagram() {
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full min-w-[640px]">
        <defs>
          <marker id="seq-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#4b5563" />
          </marker>
        </defs>

        <Lane x={LANE_X.client} label="MCPクライアント" />
        <Lane x={LANE_X.mcp} label="MCPサーバー" />
        <Lane x={LANE_X.auth0} label="認可サーバー (Auth0)" />

        <StepBadge y={90} step={1} />
        <Arrow fromX={LANE_X.client} toX={LANE_X.mcp} y={90} label="MCPリクエスト（トークン無し）" />
        <Arrow fromX={LANE_X.mcp} toX={LANE_X.client} y={132} label="401 + WWW-Authenticate" dashed />
        <Arrow fromX={LANE_X.client} toX={LANE_X.mcp} y={174} label="resource_metadata を取得" />
        <Arrow fromX={LANE_X.mcp} toX={LANE_X.client} y={216} label="Protected Resource Metadata" dashed />

        <StepBadge y={268} step={2} />
        <Arrow fromX={LANE_X.client} toX={LANE_X.auth0} y={268} label="AS metadata を取得" />
        <Arrow fromX={LANE_X.auth0} toX={LANE_X.client} y={310} label="Authorization Server Metadata" dashed />

        <StepBadge y={362} step={3} />
        <rect
          x={LANE_X.client}
          y={347}
          width={LANE_X.auth0 - LANE_X.client}
          height={30}
          className="fill-gray-50"
          stroke="#d1d5db"
          strokeDasharray="3 2"
        />
        <foreignObject x={LANE_X.client} y={352} width={LANE_X.auth0 - LANE_X.client} height={22}>
          <div className="text-[11px] text-gray-600 text-center">クライアント登録（CIMD） + 認可コードフロー（PKCE）</div>
        </foreignObject>

        <Arrow fromX={LANE_X.client} toX={LANE_X.auth0} y={410} label="トークンリクエスト" />
        <Arrow fromX={LANE_X.auth0} toX={LANE_X.client} y={452} label="アクセストークン" dashed />

        <Arrow fromX={LANE_X.client} toX={LANE_X.mcp} y={504} label="MCPリクエスト（トークン付き）" />
        <Arrow fromX={LANE_X.mcp} toX={LANE_X.client} y={546} label="MCPレスポンス" dashed />
      </svg>

      <p className="text-xs text-gray-400 mt-2">
        MCP仕様の
        <a
          href="https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization#authorization-server-discovery-sequence-diagram"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-gray-600"
        >
          Authorization Server Discovery Sequence Diagram
        </a>
        を、このサーバーが実際に通る経路に単純化したものです。①②③は下記のセクションに対応します。
      </p>
    </div>
  );
}
