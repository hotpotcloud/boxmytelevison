export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="muu-brand">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="17" fill="#0066e6" />
        <path
          d="M15 20h34v27H15zM15 20v-5h34v5M22 15v5m8-5v5m8-5v5m8-5v5"
          fill="none"
          stroke="white"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <path d="m28 27 12 7-12 7z" fill="white" />
      </svg>
      {!compact && (
        <span>
          幕间 <small>Muu</small>
        </span>
      )}
    </span>
  );
}
