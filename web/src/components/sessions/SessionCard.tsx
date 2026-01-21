'use client';

import Link from 'next/link';
import { formatDistanceToNow, format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Wrench, GitBranch, Clock } from 'lucide-react';
import type { Session } from '@/lib/types';

interface SessionCardProps {
  session: Session;
}

export function SessionCard({ session }: SessionCardProps) {
  const duration = Math.round(
    (session.endedAt.getTime() - session.startedAt.getTime()) / 60000
  );

  return (
    <Link href={`/sessions/${session.id}`}>
      <Card className="cursor-pointer transition-colors hover:bg-accent/50">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base font-medium line-clamp-1">
                {session.summary || session.generatedTitle || 'Untitled Session'}
              </CardTitle>
              <div className="flex items-center gap-2">
  <p className="text-sm text-muted-foreground">
    {session.projectName}
  </p>
  {session.sessionCharacter && (
    <Badge variant="secondary" className="text-xs capitalize">
      {session.sessionCharacter.replace(/_/g, ' ')}
    </Badge>
  )}
</div>
            </div>
            <Badge variant="outline" className="text-xs">
              {formatDistanceToNow(session.startedAt, { addSuffix: true })}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" />
              <span>{session.messageCount} messages</span>
            </div>
            <div className="flex items-center gap-1">
              <Wrench className="h-3.5 w-3.5" />
              <span>{session.toolCallCount} tools</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              <span>{duration} min</span>
            </div>
            {session.gitBranch && (
              <div className="flex items-center gap-1">
                <GitBranch className="h-3.5 w-3.5" />
                <span className="truncate max-w-[100px]">{session.gitBranch}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
