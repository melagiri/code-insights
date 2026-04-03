import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useLlmConfig, useSaveLlmConfig } from '@/hooks/useConfig';
import { useUserProfile, normalizeGithubUsername } from '@/hooks/useUserProfile';
import { fetchOllamaModels, fetchLlamaCppModels, testLlmConfig } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import {
  CheckCircle,
  XCircle,
  Cpu,
  Loader2,
  ChevronDown,
  ChevronRight,
  Check,
  Minus,
  User,
} from 'lucide-react';

// TODO: tech debt — duplicated provider types (this local type mirrors dashboard/src/lib/types.ts LLMConfig.provider)
type LLMProvider = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'llamacpp';

interface ProviderInfo {
  id: LLMProvider;
  name: string;
  requiresApiKey: boolean;
  apiKeyLink?: string;
  models: Array<{ id: string; name: string; description?: string }>;
}

const PROVIDERS: ProviderInfo[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    requiresApiKey: true,
    apiKeyLink: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-4.1', name: 'GPT-4.1', description: 'Best' },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', description: 'Fast & cheap' },
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Fallback' },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    requiresApiKey: true,
    apiKeyLink: 'https://console.anthropic.com/settings/keys',
    models: [
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', description: 'Most capable' },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', description: 'Best balance' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', description: 'Fast & cheap' },
    ],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    requiresApiKey: true,
    apiKeyLink: 'https://aistudio.google.com/app/apikey',
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Fast' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Capable' },
      { id: 'gemma-3-27b-it', name: 'Gemma 4 27B IT', description: 'Free via Gemini API' },
    ],
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    requiresApiKey: false,
    models: [
      { id: 'llama3.3', name: 'Llama 3.3' },
      { id: 'qwen3:14b', name: 'Qwen3 14B' },
      { id: 'mistral', name: 'Mistral' },
      { id: 'qwen2.5-coder', name: 'Qwen 2.5 Coder' },
      { id: 'gemma4', name: 'Gemma 4 12B' },
      { id: 'gemma4:27b', name: 'Gemma 4 27B' },
    ],
  },
  {
    id: 'llamacpp',
    name: 'llama.cpp (Local)',
    requiresApiKey: false,
    models: [
      { id: 'gemma-4-12b', name: 'Gemma 4 12B (Q4_K_M)', description: 'Flagship local model' },
      { id: 'gemma-4-27b', name: 'Gemma 4 27B (Q4_K_M)', description: 'Large local model' },
      { id: 'custom', name: 'Custom model', description: 'Any GGUF loaded in llama-server' },
    ],
  },
];

export default function SettingsPage() {
  const { data: llmConfig, isLoading: configLoading } = useLlmConfig();
  const saveMutation = useSaveLlmConfig();
  const { profile, saveProfile } = useUserProfile();

  // Profile card state
  const [profileName, setProfileName] = useState(profile?.name ?? '');
  const [profileGithubUsername, setProfileGithubUsername] = useState(profile?.githubUsername ?? '');
  const [profileAvatarError, setProfileAvatarError] = useState(false);

  // Sync profile fields when profile loads from localStorage
  useEffect(() => {
    setProfileName(profile?.name ?? '');
    setProfileGithubUsername(profile?.githubUsername ?? '');
    setProfileAvatarError(false);
  }, [profile?.name, profile?.githubUsername]);

  const profileNormalizedUsername = normalizeGithubUsername(profileGithubUsername);
  const profileAvatarUrl = profileNormalizedUsername
    ? `https://github.com/${profileNormalizedUsername}.png`
    : '';

  const handleSaveProfile = async () => {
    await saveProfile(profileName, profileGithubUsername);
    toast.success('Profile saved');
  };

  const [llmProvider, setLlmProvider] = useState<LLMProvider>('openai');
  const [llmModel, setLlmModel] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmBaseUrl, setLlmBaseUrl] = useState('');
  const [llmConfigured, setLlmConfigured] = useState(false);
  const [llmTesting, setLlmTesting] = useState(false);
  const [llmTestError, setLlmTestError] = useState<string | null>(null);
  const [ollamaDiscoveredModels, setOllamaDiscoveredModels] = useState<string[]>([]);
  const [ollamaCorsOpen, setOllamaCorsOpen] = useState(false);
  const [llamacppDiscoveredModels, setLlamacppDiscoveredModels] = useState<string[]>([]);
  const [llamacppDiscovering, setLlamacppDiscovering] = useState(false);

  // Populate form from loaded config
  useEffect(() => {
    if (!llmConfig) return;
    if (llmConfig.provider) {
      setLlmProvider(llmConfig.provider);
      setLlmConfigured(true);
    }
    if (llmConfig.model) {
      // If saved model doesn't match any preset, populate the custom input instead
      const providerInfo = PROVIDERS.find((p) => p.id === (llmConfig.provider ?? llmProvider));
      const isPreset = providerInfo?.models.some((m) => m.id === llmConfig.model);
      if (isPreset) {
        setLlmModel(llmConfig.model);
        setCustomModel('');
      } else {
        setCustomModel(llmConfig.model);
        setLlmModel(providerInfo?.models[0]?.id ?? '');
      }
    }
    // apiKey is masked by server — leave blank for re-entry
    if (llmConfig.baseUrl) setLlmBaseUrl(llmConfig.baseUrl);
  }, [llmConfig]);

  // Default model when provider changes
  useEffect(() => {
    const providerInfo = PROVIDERS.find((p) => p.id === llmProvider);
    if (providerInfo?.models[0] && !llmModel) {
      setLlmModel(providerInfo.models[0].id);
    }
  }, [llmProvider, llmModel]);

  // Discover Ollama models
  useEffect(() => {
    if (llmProvider !== 'ollama') return;
    fetchOllamaModels(llmBaseUrl || undefined)
      .then((r) => setOllamaDiscoveredModels(r.models.map((m) => m.name)))
      .catch(() => {});
  }, [llmProvider, llmBaseUrl]);

  // Handler to manually discover llamacpp models via the Discover button
  const handleDiscoverLlamaCppModels = () => {
    setLlamacppDiscovering(true);
    fetchLlamaCppModels(llmBaseUrl || undefined)
      .then((r) => {
        const names = r.models.map((m) => m.id);
        setLlamacppDiscoveredModels(names);
        if (names.length > 0 && !llmModel) {
          setLlmModel(names[0]);
        }
      })
      .catch(() => {})
      .finally(() => setLlamacppDiscovering(false));
  };

  const handleProviderChange = (provider: LLMProvider) => {
    setLlmProvider(provider);
    setLlmConfigured(false);
    setLlmTestError(null);
    setLlmApiKey('');
    setCustomModel('');
    const providerInfo = PROVIDERS.find((p) => p.id === provider);
    setLlmModel(providerInfo?.models[0]?.id ?? '');
  };

  const handleSaveLLMConfig = async () => {
    const providerInfo = PROVIDERS.find((p) => p.id === llmProvider);
    if (!providerInfo) return;

    // Custom model input overrides the dropdown selection for cloud providers
    const effectiveModel = customModel.trim() || llmModel;

    if (providerInfo.requiresApiKey && !llmApiKey) {
      setLlmTestError('API key is required');
      return;
    }
    if (!effectiveModel) {
      setLlmTestError('Please select a model');
      return;
    }

    setLlmTesting(true);
    setLlmTestError(null);

    try {
      const testResult = await testLlmConfig({
        provider: llmProvider,
        model: effectiveModel,
        apiKey: llmApiKey || undefined,
        baseUrl: llmBaseUrl || undefined,
      });

      if (testResult.success) {
        await saveMutation.mutateAsync({
          provider: llmProvider,
          model: effectiveModel,
          apiKey: llmApiKey || undefined,
          baseUrl: llmBaseUrl || undefined,
        });
        setLlmConfigured(true);
        setLlmTestError(null);
        toast.success('AI provider configured successfully');
      } else {
        setLlmTestError(testResult.error || 'Failed to connect');
      }
    } catch (err) {
      setLlmTestError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setLlmTesting(false);
    }
  };

  const handleClearLLMConfig = async () => {
    try {
      await saveMutation.mutateAsync({ provider: undefined, model: undefined, apiKey: undefined });
      setLlmConfigured(false);
      setLlmApiKey('');
      setCustomModel('');
      setLlmTestError(null);
      toast.success('AI provider configuration cleared');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to clear configuration';
      setLlmTestError(msg);
      toast.error(msg);
    }
  };

  const progressItems = [
    { label: 'AI Provider', done: llmConfigured, required: true },
  ];
  const requiredDone = progressItems.filter((p) => p.required && p.done).length;
  const requiredTotal = progressItems.filter((p) => p.required).length;

  if (configLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Configure your Code Insights dashboard</p>
        </div>
        <div className="h-32 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Configure your Code Insights dashboard</p>
      </div>

      {/* User Profile Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5" />
            <CardTitle className="text-base">Your Profile</CardTitle>
          </div>
          <CardDescription>
            Your name and GitHub avatar appear in the footer of downloaded share cards
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Live avatar preview */}
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full overflow-hidden bg-muted border border-border shrink-0 flex items-center justify-center">
              {profileAvatarUrl && !profileAvatarError ? (
                <img
                  src={profileAvatarUrl}
                  alt="GitHub avatar preview"
                  className="h-full w-full object-cover"
                  onError={() => setProfileAvatarError(true)}
                  onLoad={() => setProfileAvatarError(false)}
                />
              ) : (
                <span className="text-xl text-muted-foreground select-none">
                  {profileName.trim().charAt(0).toUpperCase() || '?'}
                </span>
              )}
            </div>
            <div className="text-sm">
              <p className="font-medium">{profileName.trim() || 'Your Name'}</p>
              {profileNormalizedUsername ? (
                <p className="text-muted-foreground text-xs">@{profileNormalizedUsername}</p>
              ) : (
                <p className="text-muted-foreground text-xs italic">Enter your GitHub username</p>
              )}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Display Name</label>
            <Input
              className="mt-1"
              placeholder="e.g. Srikanth Rao"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium">GitHub Username</label>
            <Input
              className="mt-1"
              placeholder="e.g. melagiri"
              value={profileGithubUsername}
              onChange={(e) => {
                setProfileGithubUsername(e.target.value);
                setProfileAvatarError(false);
              }}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Used to load your GitHub avatar on share cards. No @ prefix needed.
            </p>
          </div>

          <Button
            onClick={handleSaveProfile}
            disabled={!profileName.trim() || !profileNormalizedUsername}
          >
            Save Profile
          </Button>
        </CardContent>
      </Card>

      {/* Setup progress strip */}
      <div className="rounded-lg border bg-card px-4 py-3 flex items-center gap-4 flex-wrap">
        <span className="text-sm font-medium shrink-0">
          Setup: {requiredDone} of {requiredTotal} required configs complete
        </span>
        <div className="flex items-center gap-3 flex-wrap">
          {progressItems.map((item) => (
            <div key={item.label} className="flex items-center gap-1.5 text-xs">
              {item.done ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Minus className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className={item.done ? 'text-foreground' : 'text-muted-foreground'}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* LLM Provider Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="h-5 w-5" />
              <CardTitle className="text-base">AI Analysis Provider</CardTitle>
            </div>
            {llmConfigured ? (
              <Badge variant="outline" className="text-green-600 border-green-600">
                <CheckCircle className="mr-1 h-3 w-3" />
                Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="text-amber-600 border-amber-600">
                <XCircle className="mr-1 h-3 w-3" />
                Not Configured
              </Badge>
            )}
          </div>
          <CardDescription>
            Configure an LLM provider to analyze sessions and generate insights
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Provider Selection */}
          <div>
            <label className="text-sm font-medium">Provider</label>
            <Select
              value={llmProvider}
              onValueChange={(v) => handleProviderChange(v as LLMProvider)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Model Selection */}
          <div>
            <label className="text-sm font-medium">Model</label>
            {llmProvider === 'ollama' ? (
              <div className="mt-1 space-y-2">
                <Input
                  value={llmModel}
                  onChange={(e) => setLlmModel(e.target.value)}
                  placeholder="Type any model name (e.g. llama3.3)"
                />
                {(() => {
                  const hardcoded =
                    PROVIDERS.find((p) => p.id === 'ollama')?.models.map((m) => m.id) ?? [];
                  const suggestions = [...new Set([...hardcoded, ...ollamaDiscoveredModels])];
                  return suggestions.length > 0 ? (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">Suggestions:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {suggestions.map((name) => (
                          <button
                            key={name}
                            type="button"
                            onClick={() => setLlmModel(name)}
                            className="text-xs px-2 py-0.5 rounded-md border border-border bg-muted hover:bg-accent hover:text-accent-foreground transition-colors"
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            ) : llmProvider === 'llamacpp' ? (
              <div className="mt-1 space-y-2">
                <Input
                  value={llmModel}
                  onChange={(e) => setLlmModel(e.target.value)}
                  placeholder="Type any model name (e.g. gemma-4-12b)"
                />
                {(() => {
                  const hardcoded =
                    PROVIDERS.find((p) => p.id === 'llamacpp')?.models.map((m) => m.id) ?? [];
                  const suggestions = [...new Set([...hardcoded, ...llamacppDiscoveredModels])];
                  return suggestions.length > 0 ? (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">Suggestions:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {suggestions.map((name) => (
                          <button
                            key={name}
                            type="button"
                            onClick={() => setLlmModel(name)}
                            className="text-xs px-2 py-0.5 rounded-md border border-border bg-muted hover:bg-accent hover:text-accent-foreground transition-colors"
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            ) : (
              <div className="mt-1 space-y-2">
                <Select value={llmModel} onValueChange={setLlmModel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.find((p) => p.id === llmProvider)?.models.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        <div className="flex items-center justify-between gap-2">
                          <span>{model.name}</span>
                          {model.description && (
                            <span className="text-xs text-muted-foreground">
                              {model.description}
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div>
                  <label className="text-xs text-muted-foreground">Or enter a custom model ID</label>
                  <Input
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    placeholder="e.g. gpt-4.1-nano, claude-opus-4-6"
                    className="mt-1"
                  />
                  {customModel.trim() && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Custom model <span className="font-mono">{customModel.trim()}</span> will be used instead of the dropdown selection.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* API Key (if required) */}
          {PROVIDERS.find((p) => p.id === llmProvider)?.requiresApiKey && (
            <div>
              <label className="text-sm font-medium">API Key</label>
              <Input
                type="password"
                value={llmApiKey}
                onChange={(e) => {
                  setLlmApiKey(e.target.value);
                  setLlmConfigured(false);
                }}
                placeholder={
                  llmConfigured
                    ? 'Leave blank to keep existing key'
                    : llmProvider === 'openai'
                      ? 'sk-...'
                      : llmProvider === 'anthropic'
                        ? 'sk-ant-...'
                        : 'AIza...'
                }
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Get your API key from{' '}
                <a
                  href={PROVIDERS.find((p) => p.id === llmProvider)?.apiKeyLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {PROVIDERS.find((p) => p.id === llmProvider)?.name}
                </a>
              </p>
            </div>
          )}

          {/* llama.cpp: Base URL + model discovery button */}
          {llmProvider === 'llamacpp' && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Base URL (optional)</label>
                <Input
                  value={llmBaseUrl}
                  onChange={(e) => setLlmBaseUrl(e.target.value)}
                  placeholder="http://localhost:8080"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Leave empty for default (localhost:8080). Start llama-server with:{' '}
                  <code className="bg-muted px-0.5 rounded">llama-server -m &lt;model.gguf&gt;</code>
                </p>
              </div>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDiscoverLlamaCppModels}
                  disabled={llamacppDiscovering}
                >
                  {llamacppDiscovering ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      Discovering...
                    </>
                  ) : (
                    'Discover Loaded Model'
                  )}
                </Button>
                <p className="text-xs text-muted-foreground mt-1">
                  Queries the running llama-server instance to detect the currently loaded model.
                </p>
              </div>
            </div>
          )}

          {/* Ollama: Base URL + collapsible CORS instructions */}
          {llmProvider === 'ollama' && (
            <>
              <div>
                <label className="text-sm font-medium">Base URL (optional)</label>
                <Input
                  value={llmBaseUrl}
                  onChange={(e) => setLlmBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Leave empty for default (localhost:11434)
                </p>
              </div>

              {/* Collapsible CORS instructions */}
              <Collapsible open={ollamaCorsOpen} onOpenChange={setOllamaCorsOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200 transition-colors"
                  >
                    {ollamaCorsOpen ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    Ollama connection notes
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 space-y-2">
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Ollama runs locally on your machine. The dashboard connects to it via the
                      Hono server at localhost:7890, so no CORS configuration is required.
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Ensure Ollama is running before testing:{' '}
                      <code className="bg-amber-100 dark:bg-amber-950/50 px-0.5 rounded">
                        ollama serve
                      </code>
                    </p>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </>
          )}

          {/* Error message */}
          {llmTestError && <p className="text-sm text-red-500">{llmTestError}</p>}

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button onClick={handleSaveLLMConfig} disabled={llmTesting || saveMutation.isPending}>
              {llmTesting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : llmConfigured ? (
                'Update Configuration'
              ) : (
                'Save & Test'
              )}
            </Button>
            {llmConfigured && (
              <Button
                variant="outline"
                onClick={handleClearLLMConfig}
                disabled={saveMutation.isPending}
              >
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* CLI Setup */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">CLI Setup</CardTitle>
          <CardDescription>
            Install and configure the CLI to sync your AI coding sessions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-4 font-mono text-sm">
            <p className="text-muted-foreground"># Install the CLI</p>
            <p>npm install -g @code-insights/cli</p>
            <p className="mt-2 text-muted-foreground"># Initialize</p>
            <p>code-insights init</p>
            <p className="mt-2 text-muted-foreground"># Sync your sessions</p>
            <p>code-insights sync</p>
            <p className="mt-2 text-muted-foreground"># Open this dashboard</p>
            <p>code-insights dashboard</p>
          </div>
          <p className="text-sm text-muted-foreground">
            The CLI parses sessions from Claude Code, Cursor, Codex CLI, and Copilot CLI into a
            local SQLite database. All data stays on your machine.
          </p>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="text-center text-xs text-muted-foreground pt-2 pb-4">
        Code Insights &mdash;{' '}
        <a
          href="https://github.com/melagiri/code-insights"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground transition-colors"
        >
          View on GitHub
        </a>
      </div>
    </div>
  );
}
