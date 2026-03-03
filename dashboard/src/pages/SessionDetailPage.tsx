import { Navigate, useParams } from 'react-router';

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/sessions?session=${id}`} replace />;
}
