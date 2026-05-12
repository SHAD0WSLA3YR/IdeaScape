import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Settings, User, Palette, Monitor, Sun, Moon, Save, Zap } from 'lucide-react';
import { useCanvasStore } from '../store/canvasStore';
import { NVIDIA_MODELS, aiService } from '../services/aiService';
import { toast } from 'sonner';

export function SettingsPanel() {
  const { settings, updateSettings, setTheme, setAiProvider, setAiModel } = useCanvasStore();
  const [rateStatus, setRateStatus] = useState(() => aiService.getRateLimitStatus());

  const [tempProfile, setTempProfile] = useState({
    username: settings.profile.username,
    email: settings.profile.email,
  });

  useEffect(() => {
    const updateRateStatus = () => setRateStatus(aiService.getRateLimitStatus());
    updateRateStatus();
    const timer = window.setInterval(updateRateStatus, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    toast.success(`Theme changed to ${newTheme}`);
  };

  const handleProfileSave = () => {
    updateSettings({
      profile: tempProfile
    });
    toast.success('Profile updated successfully');
  };

  const handleAiProviderChange = (provider: 'nvidia') => {
    setAiProvider(provider);
    toast.success('AI provider switched to NVIDIA');
  };

  const themeOptions = [
    { value: 'light', label: 'Light', icon: <Sun className="w-4 h-4" /> },
    { value: 'dark', label: 'Dark', icon: <Moon className="w-4 h-4" /> },
    { value: 'system', label: 'System', icon: <Monitor className="w-4 h-4" /> }
  ];

  const aiProviderOptions = [
    { value: 'nvidia', label: 'NVIDIA NIM (Free)', icon: <Zap className="w-4 h-4" /> },
  ];

  const currentModelCatalog = Object.entries(NVIDIA_MODELS).map(([id, label]) => ({ value: id, label }));

  const handleModelChange = (model: string) => {
    setAiModel(model);
    const label = currentModelCatalog.find(m => m.value === model)?.label ?? model;
    toast.success(`Model switched to ${label}`);
  };

  const getCurrentThemeIcon = () => {
    const theme = themeOptions.find(t => t.value === settings.theme);
    return theme?.icon || <Monitor className="w-4 h-4" />;
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Settings
        </DialogTitle>
        <DialogDescription>
          Customize your mind mapping experience
        </DialogDescription>
      </DialogHeader>

      <div className="max-h-[70vh] overflow-y-auto pr-1">
        <div className="space-y-6">
          {/* Theme Settings Section */}
          <div>
            <h3 className="font-medium text-base mb-3 flex items-center gap-2">
              <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center">
                <Palette className="w-3 h-3 text-primary" />
              </div>
              Appearance
            </h3>
            <div className="space-y-3 ml-8">
              <div className="space-y-2">
                <Label htmlFor="theme-select">Theme</Label>
                <Select value={settings.theme} onValueChange={handleThemeChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select theme">
                      <div className="flex items-center gap-2">
                        {getCurrentThemeIcon()}
                        <span className="capitalize">{settings.theme}</span>
                      </div>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {themeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center gap-2">
                          {option.icon}
                          <span>{option.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {settings.theme === 'system'
                    ? 'Automatically matches your device\'s theme preference'
                    : `Always use ${settings.theme} theme`
                  }
                </p>
              </div>
            </div>
          </div>

          {/* AI Provider Section */}
          <div>
            <h3 className="font-medium text-base mb-3 flex items-center gap-2">
              <div className="w-6 h-6 bg-orange-100/80 dark:bg-orange-900/40 rounded-full flex items-center justify-center">
                <Zap className="w-3 h-3 text-orange-600 dark:text-orange-400" />
              </div>
              AI Provider
            </h3>
            <div className="space-y-3 ml-8">
              <div className="space-y-2">
                <Label htmlFor="ai-provider-select">Provider</Label>
                <Select value={settings.aiProvider} onValueChange={handleAiProviderChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select AI provider">
                      <div className="flex items-center gap-2">
                        {aiProviderOptions.find(o => o.value === settings.aiProvider)?.icon}
                        <span>{aiProviderOptions.find(o => o.value === settings.aiProvider)?.label}</span>
                      </div>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {aiProviderOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center gap-2">
                          {option.icon}
                          <span>{option.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai-model-select">Model</Label>
                <Select value={settings.aiModel} onValueChange={handleModelChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select model">
                      <span>{currentModelCatalog.find(m => m.value === settings.aiModel)?.label ?? settings.aiModel}</span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {currentModelCatalog.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  NVIDIA is the only provider in this build.
                </p>
              </div>

              <div className="rounded-md border border-orange-200/70 dark:border-orange-800/60 bg-orange-50/70 dark:bg-orange-950/20 p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-orange-700 dark:text-orange-300">Rate limit (40 req/min)</span>
                  <Badge variant="outline" className="text-xs">
                    {rateStatus.server?.remaining ?? rateStatus.clientRemaining} left
                  </Badge>
                </div>
                <p className="mt-1 text-orange-700/90 dark:text-orange-300/90">
                  Used this minute: {rateStatus.server?.used ?? rateStatus.clientUsed}/{rateStatus.server?.limit ?? rateStatus.limit}
                </p>
                <p className="mt-1 text-[11px] text-orange-600/80 dark:text-orange-300/70">
                  Counter updates live from recent requests. Server value is shown when available.
                </p>
              </div>
            </div>
          </div>

          {/* Profile Settings Section */}
          <div>
            <h3 className="font-medium text-base mb-3 flex items-center gap-2">
              <div className="w-6 h-6 bg-green-100/80 dark:bg-green-900/40 rounded-full flex items-center justify-center">
                <User className="w-3 h-3 text-green-600 dark:text-green-400" />
              </div>
              Profile
            </h3>
            <div className="space-y-4 ml-8">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  value={tempProfile.username}
                  onChange={(e) => setTempProfile(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="Enter your username"
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={tempProfile.email}
                  onChange={(e) => setTempProfile(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="Enter your email"
                  className="w-full"
                />
              </div>

              <Button
                onClick={handleProfileSave}
                className="w-full flex items-center gap-2"
                disabled={tempProfile.username === settings.profile.username && tempProfile.email === settings.profile.email}
              >
                <Save className="w-4 h-4" />
                Save Profile
              </Button>
            </div>
          </div>

          {/* Current Session Section */}
          <div>
            <h3 className="font-medium text-base mb-3 flex items-center gap-2">
              <div className="w-6 h-6 bg-purple-100/80 dark:bg-purple-900/40 rounded-full flex items-center justify-center">
                <Settings className="w-3 h-3 text-purple-600 dark:text-purple-400" />
              </div>
              Current Session
            </h3>
            <div className="space-y-2 ml-8">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Theme Active:</span>
                <Badge variant="outline" className="text-xs">
                  {settings.theme === 'system'
                    ? `System (${document.documentElement.classList.contains('dark') ? 'Dark' : 'Light'})`
                    : settings.theme
                  }
                </Badge>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">AI Model:</span>
                <Badge variant="outline" className="text-xs truncate max-w-[180px]">
                  {currentModelCatalog.find(m => m.value === settings.aiModel)?.label ?? settings.aiModel}
                </Badge>
              </div>
              {settings.profile.username && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Signed in as:</span>
                  <Badge variant="outline" className="text-xs">
                    {settings.profile.username}
                  </Badge>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="text-xs text-muted-foreground mt-4 p-3 bg-muted/50 dark:bg-muted/20 rounded">
          <p><strong>Note:</strong> All settings are automatically saved and synced with your canvas data. Theme preferences apply immediately.</p>
        </div>
      </div>
    </>
  );
}
