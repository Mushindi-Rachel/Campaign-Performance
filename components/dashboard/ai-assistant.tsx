'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bot, Send, User, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { answerCampaignQuestion, type GeneratedInsight, type GeneratedRecommendation } from '@/lib/ai-engine';
import type { CampaignSummary } from '@/lib/types';

interface AiAssistantProps {
  summaries: CampaignSummary[];
  insights: GeneratedInsight[];
  recommendations: GeneratedRecommendation[];
}

interface Message {
  role: 'user' | 'ai';
  content: string;
}

const suggestedQuestions = [
  'Which campaign should we increase budget for?',
  'Why did conversions fall recently?',
  'Are there any anomalies?',
  'What do you recommend?',
];

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Calls the ai-chat edge function (real OpenAI-backed assistant). Returns
 * null if the call fails or OpenAI isn't configured yet, so the caller can
 * fall back to the local keyword-matched assistant instead of erroring out.
 */
async function askLlm(
  question: string,
  summaries: CampaignSummary[],
  insights: GeneratedInsight[],
  recommendations: GeneratedRecommendation[],
  history: Message[],
): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question,
        context: {
          summaries: summaries.map((s) => ({
            name: s.campaign.name,
            status: s.aiStatus,
            totalSpend: s.totalSpend,
            totalConversions: s.totalConversions,
            avgCtr: s.avgCtr,
            avgCpl: s.avgCpl,
            conversionRate: s.conversionRate,
            avgEngagementRate: s.avgEngagementRate,
          })),
          insights: insights.map((i) => ({
            title: i.title,
            description: i.description,
            severity: i.severity,
            campaignName: i.campaignName,
          })),
          recommendations: recommendations.map((r) => ({
            title: r.title,
            action: r.action,
            priority: r.priority,
            campaignName: r.campaignName,
          })),
        },
        history: history.slice(-6).map((m) => ({
          role: m.role === 'ai' ? 'assistant' : 'user',
          content: m.content,
        })),
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.answer ?? null;
  } catch {
    return null;
  }
}

export function AiAssistant({ summaries, insights, recommendations }: AiAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'ai',
      content: 'Hi! I\'m your Campaign AI assistant. I can analyze your Meta and GA4 data in real time. Ask me about budget allocation, conversion drops, anomalies, or recommendations.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  async function handleAsk(question: string) {
    if (!question.trim() || isThinking) return;
    const userMsg: Message = { role: 'user', content: question };
    const historyForRequest = messages;
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsThinking(true);

    const llmAnswer = await askLlm(question, summaries, insights, recommendations, historyForRequest);

    if (llmAnswer) {
      setUsingFallback(false);
      setMessages((prev) => [...prev, { role: 'ai', content: llmAnswer }]);
      setIsThinking(false);
    } else {
      // OpenAI not configured or the call failed — fall back to the local
      // keyword-matched assistant so the feature still works offline.
      setUsingFallback(true);
      setTimeout(() => {
        const answer = answerCampaignQuestion(question, summaries, insights, recommendations);
        setMessages((prev) => [...prev, { role: 'ai', content: answer }]);
        setIsThinking(false);
      }, 400);
    }
  }

  return (
    <Card className="flex flex-col h-[500px]">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg">Ask Campaign AI</CardTitle>
            <CardDescription>Ask questions about your campaign performance</CardDescription>
          </div>
          {usingFallback && (
            <div
              className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
              title="OPENAI_API_KEY isn't configured on the ai-chat function (or the call failed), so this is using the built-in rule-based assistant instead of the LLM."
            >
              <WifiOff className="h-3 w-3" />
              Offline mode
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 gap-3 overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-1">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn('flex gap-2.5', msg.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              {msg.role === 'ai' && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
              )}
              <div
                className={cn(
                  'max-w-[80%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-line',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                )}
              >
                {msg.content}
              </div>
              {msg.role === 'user' && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary">
                  <User className="h-3.5 w-3.5 text-primary-foreground" />
                </div>
              )}
            </div>
          ))}
          {isThinking && (
            <div className="flex gap-2.5 justify-start">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="bg-muted rounded-lg px-3.5 py-2.5">
                <div className="flex gap-1">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {suggestedQuestions.map((q) => (
            <button
              key={q}
              onClick={() => handleAsk(q)}
              disabled={isThinking}
              className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAsk(input);
          }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your campaigns..."
            disabled={isThinking}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
          />
          <Button type="submit" size="icon" disabled={isThinking || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
