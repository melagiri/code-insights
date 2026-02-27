import { useParams } from 'react-router';

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Session Detail</h1>
      <p className="text-muted-foreground mt-2">Session {id} — coming in Phase 4.</p>
    </div>
  );
}
