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

  const handleSaveAll = () => {
    updateSettings({ profile: tempProfile });
    toast.success('Settings saved');
  };

  const hasProfileChanges = tempProfile.username !== settings.profile.username || tempProfile.email !== settings.profile.email;
  const usedCount = rateStatus.server?.used ?? rateStatus.clientUsed ?? 0;
  const limitCount = rateStatus.server?.limit ?? rateStatus.limit ?? 40;
  const ratePercent = Math.min((usedCount / limitCount) * 100, 100);

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

      <div className="max-h-[55vh] overflow-y-auto pr-1">
        <div className="space-y-6">
          {/* Appearance Section */}
          <div>
            <h3 className="font-medium text-base mb-3 flex items-center gap-2">
              <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center">
                <Palette className="w-3 h-3 text-primary" />
              </div>
              Appearance
            </h3>
            <div className="space-y-3 ml-8">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Theme</Label>
                <div className="flex rounded-lg border p-0.5 bg-muted/50 w-fit">
                  {themeOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleThemeChange(option.value)}
                      title={option.label}
                      className={`flex items-center justify-center p-2 rounded-md transition-all ${
                        settings.theme === option.value
                          ? 'bg-background shadow-sm'
                          : 'hover:bg-background/50 text-muted-foreground'
                      }`}
                    >
                      {option.icon}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* AI Engine Section */}
          <div>
            <h3 className="font-medium text-base mb-3 flex items-center gap-2">
              <div className="w-6 h-6 bg-orange-100/80 dark:bg-orange-900/40 rounded-full flex items-center justify-center">
                <Zap className="w-3 h-3 text-orange-600 dark:text-orange-400" />
              </div>
              AI Engine
            </h3>
            <div className="space-y-3 ml-8">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Provider</Label>
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
                  <Label className="text-xs text-muted-foreground">Model</Label>
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
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Rate limit (40 req/min)</span>
                  <Badge variant="outline" className="text-xs">
                    {rateStatus.server?.remaining ?? rateStatus.clientRemaining} left
                  </Badge>
                </div>
                <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-500 rounded-full transition-all duration-500"
                    style={{ width: `${ratePercent}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Profile Section */}
          <div>
            <h3 className="font-medium text-base mb-3 flex items-center gap-2">
              <div className="w-6 h-6 bg-green-100/80 dark:bg-green-900/40 rounded-full flex items-center justify-center">
                <User className="w-3 h-3 text-green-600 dark:text-green-400" />
              </div>
              Profile
            </h3>
            <div className="space-y-4 ml-8">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-xs text-muted-foreground">Username</Label>
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
                <Label htmlFor="email" className="text-xs text-muted-foreground">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={tempProfile.email}
                  onChange={(e) => setTempProfile(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="Enter your email"
                  className="w-full"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky bottom action bar */}
      <div className="border-t pt-3 mt-3">
        <Button
          onClick={handleSaveAll}
          className="w-full flex items-center gap-2"
          disabled={!hasProfileChanges}
        >
          <Save className="w-4 h-4" />
          Save Changes
        </Button>
      </div>
    </>
  );
}
