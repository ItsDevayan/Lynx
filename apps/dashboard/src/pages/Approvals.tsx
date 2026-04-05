import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';

interface HITLRequest {
  id: string;
  type: string;
  title: string;
  description: string;
  payload: Record<string, unknown>;
  status: string;
  createdAt: string;
}

async function fetchPending(): Promise<{ requests: HITLRequest[] }> {
  const r = await fetch('/api/hitl');
  return r.json();
}

async function act(id: string, action: 'approve' | 'reject', notes?: string) {
  await fetch(`/api/hitl/${id}/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ by: 'dashboard-user', notes }),
  });
}

const TYPE_ICON: Record<string, string> = {
  code_change: '💻',
  security_fix: '🔐',
  dependency_update: '📦',
  deployment: '🚀',
  config_change: '⚙️',
};

export function ApprovalsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['hitl'],
    queryFn: fetchPending,
    refetchInterval: 5000,
  });

  const approve = useMutation({
    mutationFn: (id: string) => act(id, 'approve'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hitl'] }),
  });

  const reject = useMutation({
    mutationFn: (id: string) => act(id, 'reject'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hitl'] }),
  });

  const requests = data?.requests ?? [];

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold mb-1">Approvals</h1>
          <p className="text-sm" style={{ color: '#8888aa' }}>
            Lynx proposes, you decide. Nothing happens without your approval.
          </p>
        </div>
        {requests.length > 0 && (
          <span
            className="flex items-center gap-2 text-sm px-3 py-1 rounded-full font-mono"
            style={{ background: '#D85A3022', color: '#D85A30', border: '1px solid #D85A3044' }}
          >
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#D85A30' }} />
            {requests.length} pending
          </span>
        )}
      </div>

      {isLoading && <p className="text-sm" style={{ color: '#8888aa' }}>Loading...</p>}

      <div className="space-y-4">
        {requests.map((req, i) => (
          <motion.div
            key={req.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="rounded-xl border overflow-hidden"
            style={{ background: '#12121a', borderColor: '#1e1e2e' }}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b flex items-center justify-between gap-4" style={{ borderColor: '#1e1e2e' }}>
              <div className="flex items-center gap-3">
                <span className="text-xl">{TYPE_ICON[req.type] ?? '🤖'}</span>
                <div>
                  <h3 className="font-semibold text-sm">{req.title}</h3>
                  <p className="text-xs" style={{ color: '#8888aa' }}>
                    {req.type} • {formatDistanceToNow(new Date(req.createdAt))} ago
                  </p>
                </div>
              </div>
              <span
                className="text-xs px-2 py-0.5 rounded font-mono"
                style={{ background: '#BA751722', color: '#BA7517', border: '1px solid #BA751744' }}
              >
                PENDING
              </span>
            </div>

            {/* Description */}
            <div className="px-5 py-4">
              <p className="text-sm mb-4" style={{ color: '#c0c0d8' }}>{req.description}</p>

              {/* Payload preview */}
              {Object.keys(req.payload).length > 0 && (
                <pre
                  className="text-xs p-3 rounded-lg overflow-x-auto mb-4"
                  style={{ background: '#0a0a0f', color: '#8888aa', border: '1px solid #1e1e2e' }}
                >
                  {JSON.stringify(req.payload, null, 2)}
                </pre>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => approve.mutate(req.id)}
                  disabled={approve.isPending || reject.isPending}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: '#1D9E7522',
                    color: '#1D9E75',
                    border: '1px solid #1D9E7544',
                  }}
                >
                  ✓ Approve
                </button>
                <button
                  onClick={() => reject.mutate(req.id)}
                  disabled={approve.isPending || reject.isPending}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: '#D85A3022',
                    color: '#D85A30',
                    border: '1px solid #D85A3044',
                  }}
                >
                  ✗ Reject
                </button>
              </div>
            </div>
          </motion.div>
        ))}

        {!isLoading && requests.length === 0 && (
          <div className="text-center py-20">
            <p className="text-4xl mb-4">☑️</p>
            <p className="font-semibold mb-1">All clear</p>
            <p className="text-sm" style={{ color: '#8888aa' }}>
              No pending approvals. Lynx is waiting for work.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
