'use client';

import { use } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { useSession, useInsights } from '@/lib/hooks/useFirestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { InsightCard } from '@/components/insights/InsightCard';
import { EnhanceButton } from '@/components/gemini/EnhanceButton';
import { ArrowLeft, MessageSquare, Wrench, Clock, GitBranch, Calendar } from 'lucide-react';

interface SessionDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function SessionDetailPage({ params }: SessionDetailPageProps) {
  const { id } = use(params);
  const { session, loading, error } = useSession(id);
  const { insights } = useInsights({ sessionId: id });

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">
            {error || 'Session not found'}
          </p>
        </div>
      </div>
    );
  }

  const duration = Math.round(
    (session.endedAt.getTime() - session.startedAt.getTime()) / 60000
  );

  return (
    <div className="p-6 space-y-6">
      {/* Back button */}
      <Link href="/sessions">
        <Button variant="ghost" size="sm" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Sessions
        </Button>
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">
          {session.summary || session.generatedTitle || 'Untitled Session'}
        </h1>
        <p className="text-muted-foreground">{session.projectName}</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{session.messageCount}</p>
                <p className="text-sm text-muted-foreground">Messages</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Wrench className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{session.toolCallCount}</p>
                <p className="text-sm text-muted-foreground">Tool Calls</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{duration} min</p>
                <p className="text-sm text-muted-foreground">Duration</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-lg font-medium">
                  {format(session.startedAt, 'MMM d, yyyy')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {format(session.startedAt, 'h:mm a')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Session Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Project:</span>
            <span className="text-sm">{session.projectPath}</span>
          </div>
          {session.gitBranch && (
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{session.gitBranch}</span>
            </div>
          )}
          {session.claudeVersion && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Claude Code:</span>
              <Badge variant="secondary">{session.claudeVersion}</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Enhancement */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <EnhanceButton session={session} />
        </CardContent>
      </Card>

      {/* Insights */}
      <div>
        <h2 className="text-lg font-semibold mb-4">
          Insights ({insights.length})
        </h2>
        {insights.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {insights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} showProject={false} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-muted-foreground">No insights extracted from this session.</p>
          </div>
        )}
      </div>
    </div>
  );
}
