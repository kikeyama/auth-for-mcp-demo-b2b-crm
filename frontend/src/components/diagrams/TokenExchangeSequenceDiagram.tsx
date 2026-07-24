const LANE_X = { client: 90, mcp: 320, api: 550, auth0: 780 };
const WIDTH = 860;
const HEIGHT = 380;

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
      <foreignObject x={Math.min(fromX, toX)} y={y - 36} width={Math.abs(toX - fromX)} height={32}>
        <div className="h-full flex flex-col justify-end items-center text-center">
          <div className="text-[11px] text-gray-600 leading-tight font-mono">{label}</div>
        </div>
      </foreignObject>
      <line
        x1={fromX}
        y1={y}
        x2={toX - dir * 8}
        y2={y}
        stroke="#4b5563"
        strokeWidth={1.5}
        strokeDasharray={dashed ? '4 3' : undefined}
        markerEnd="url(#obo-arrowhead)"
      />
    </g>
  );
}

// MCP仕様の Access Token Privilege Restriction
// (https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization#access-token-privilege-restriction)
// に従い、MCPサーバーは受け取ったトークンをそのまま下流へ渡さず、On-Behalf-Of (OBO) Token
// Exchangeで別トークンに交換する。トークン取得済みの状態から、実際のツール呼び出し1回分の
// 流れ（OBO交換 → downstream API呼び出し → MCPレスポンス）だけを示す。
export function TokenExchangeSequenceDiagram() {
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full min-w-[700px]">
        <defs>
          <marker id="obo-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#4b5563" />
          </marker>
        </defs>

        <Lane x={LANE_X.client} label="MCPクライアント" />
        <Lane x={LANE_X.mcp} label="MCPサーバー" />
        <Lane x={LANE_X.api} label="マイクロサービス" />
        <Lane x={LANE_X.auth0} label="認可サーバー (Auth0)" />

        <Arrow fromX={LANE_X.client} toX={LANE_X.mcp} y={100} label="MCPリクエスト（アクセストークン付き）" />
        <Arrow fromX={LANE_X.mcp} toX={LANE_X.auth0} y={152} label="OBOトークン交換リクエスト" />
        <Arrow fromX={LANE_X.auth0} toX={LANE_X.mcp} y={204} label="APIトークン（audience=API_AUDIENCE）" dashed />
        <Arrow fromX={LANE_X.mcp} toX={LANE_X.api} y={256} label="APIリクエスト（Bearer APIトークン）" />
        <Arrow fromX={LANE_X.api} toX={LANE_X.mcp} y={308} label="APIレスポンス" dashed />
        <Arrow fromX={LANE_X.mcp} toX={LANE_X.client} y={360} label="MCPレスポンス" dashed />
      </svg>

      <p className="text-xs text-gray-400 mt-2">
        MCPサーバーは受け取ったトークンをそのまま下流に渡さず、On-Behalf-Of (OBO) Token Exchangeで
        downstream API向けの別トークンに交換します（
        <a
          href="https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization#access-token-privilege-restriction"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-gray-600"
        >
          MCP仕様 Access Token Privilege Restriction
        </a>
        ）。
      </p>
    </div>
  );
}
