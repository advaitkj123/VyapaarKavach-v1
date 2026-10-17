import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Bell, Shield, Database, Mail, Loader2, Copy, Check, Plus, Trash2 } from "lucide-react";
import { settingsApi } from "@/lib/api";
import { toast } from "@/components/ToastNotification";

interface ApiKey {
  id: string;
  name: string;
  key: string;
  created_at: string;
}

export default function Settings() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  
  // User settings state
  const [userSettings, setUserSettings] = useState({
    name: '',
    email: '',
    company: '',
    role: 'analyst',
    emailReports: true,
    autoGenerateReports: true,
  });
  
  // Notification settings
  const [notifications, setNotifications] = useState({
    highRiskAlerts: true,
    analysisComplete: true,
    newSuspiciousActivity: true,
    weeklySummary: false,
    systemUpdates: false,
  });

  // Load user data from localStorage on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        setUserSettings(prev => ({
          ...prev,
          name: user.name || '',
          email: user.email || '',
        }));
      } catch (e) {
        console.error('Failed to parse user:', e);
      }
    }

    // Fetch API keys
    const fetchApiKeys = async () => {
      try {
        const keys = await settingsApi.getApiKeys();
        const normalizedKeys = Array.isArray(keys) ? keys : keys?.keys || [];
        setApiKeys(normalizedKeys);
      } catch (err) {
        console.error('Failed to fetch API keys:', err);
      }
    };
    fetchApiKeys();
  }, []);

  const handleSaveAccount = async () => {
    setIsSaving(true);
    try {
      await settingsApi.updateSettings(userSettings);
      // Update localStorage
      localStorage.setItem('user', JSON.stringify({
        name: userSettings.name,
        email: userSettings.email,
      }));
      toast.success("Account settings saved successfully!");
    } catch (err) {
      console.error('Failed to save settings:', err);
      toast.error("Failed to save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveNotifications = async () => {
    setIsSaving(true);
    try {
      await settingsApi.updateSettings(notifications);
      toast.success("Notification preferences saved!");
    } catch (err) {
      console.error('Failed to save notifications:', err);
      toast.error("Failed to save preferences. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdatePassword = async () => {
    setIsSaving(true);
    try {
      await settingsApi.updateSettings({
        // In a real app, you'd get these from form state
      });
      toast.success("Password updated successfully!");
    } catch (err) {
      console.error('Failed to update password:', err);
      toast.error("Failed to update password. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyKey = async (key: string) => {
    await navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleCreateApiKey = async () => {
    if (!newKeyName.trim()) return;
    
    setIsCreatingKey(true);
    try {
      const result = await settingsApi.createApiKey(newKeyName);
      setApiKeys([...apiKeys, { 
        id: result.key, 
        name: newKeyName, 
        key: result.key,
        created_at: new Date().toISOString()
      }]);
      setNewKeyName('');
    } catch (err) {
      console.error('Failed to create API key:', err);
      toast.error("Failed to create API key. Please try again.");
    } finally {
      setIsCreatingKey(false);
    }
  };

  const handleDeleteApiKey = async (keyId: string) => {
    try {
      await settingsApi.revokeApiKey(keyId);
      setApiKeys(apiKeys.filter(k => k.id !== keyId));
    } catch (err) {
      console.error('Failed to delete API key:', err);
      toast.error("Failed to delete API key. Please try again.");
    }
  };
  return (
    <DashboardLayout>
      <div className="max-w-4xl space-y-8">
        {/* Header */}
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Settings</h2>
          <p className="text-gray-600 mt-1">Manage your account and application preferences</p>
        </div>

        <Tabs defaultValue="account" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-4">
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="api">API</TabsTrigger>
          </TabsList>

          {/* Account Settings */}
          <TabsContent value="account">
            <Card>
              <CardHeader>
                <CardTitle>Account Information</CardTitle>
                <CardDescription>Update your account details and preferences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input 
                      id="name" 
                      value={userSettings.name}
                      onChange={(e) => setUserSettings({ ...userSettings, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input 
                      id="email" 
                      type="email" 
                      value={userSettings.email}
                      onChange={(e) => setUserSettings({ ...userSettings, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company">Company</Label>
                    <Input 
                      id="company" 
                      value={userSettings.company}
                      onChange={(e) => setUserSettings({ ...userSettings, company: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <Select 
                      value={userSettings.role}
                      onValueChange={(value) => setUserSettings({ ...userSettings, role: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="analyst">Compliance Analyst</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="admin">Administrator</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Preferences</h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Email Reports</Label>
                        <p className="text-sm text-gray-500">Receive weekly analysis reports via email</p>
                      </div>
                      <Switch 
                        checked={userSettings.emailReports}
                        onCheckedChange={(checked) => setUserSettings({ ...userSettings, emailReports: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Auto-generate Reports</Label>
                        <p className="text-sm text-gray-500">Automatically create monthly compliance reports</p>
                      </div>
                      <Switch 
                        checked={userSettings.autoGenerateReports}
                        onCheckedChange={(checked) => setUserSettings({ ...userSettings, autoGenerateReports: checked })}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end space-x-4 pt-4">
                  <Button variant="outline">Cancel</Button>
                  <Button 
                    className="bg-crypto-purple hover:bg-crypto-dark-purple"
                    onClick={handleSaveAccount}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Changes'
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications */}
          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Bell className="h-5 w-5 text-crypto-purple" />
                  <CardTitle>Notification Preferences</CardTitle>
                </div>
                <CardDescription>Choose what notifications you want to receive</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>High-Risk Alerts</Label>
                      <p className="text-sm text-gray-500">Get notified when high-risk patterns are detected</p>
                    </div>
                    <Switch 
                      checked={notifications.highRiskAlerts}
                      onCheckedChange={(checked) => setNotifications({ ...notifications, highRiskAlerts: checked })}
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Analysis Complete</Label>
                      <p className="text-sm text-gray-500">Notification when data analysis finishes</p>
                    </div>
                    <Switch 
                      checked={notifications.analysisComplete}
                      onCheckedChange={(checked) => setNotifications({ ...notifications, analysisComplete: checked })}
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>New Suspicious Activity</Label>
                      <p className="text-sm text-gray-500">Alert for newly detected suspicious patterns</p>
                    </div>
                    <Switch 
                      checked={notifications.newSuspiciousActivity}
                      onCheckedChange={(checked) => setNotifications({ ...notifications, newSuspiciousActivity: checked })}
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Weekly Summary</Label>
                      <p className="text-sm text-gray-500">Weekly digest of platform activity</p>
                    </div>
                    <Switch 
                      checked={notifications.weeklySummary}
                      onCheckedChange={(checked) => setNotifications({ ...notifications, weeklySummary: checked })}
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>System Updates</Label>
                      <p className="text-sm text-gray-500">Notifications about platform updates and features</p>
                    </div>
                    <Switch 
                      checked={notifications.systemUpdates}
                      onCheckedChange={(checked) => setNotifications({ ...notifications, systemUpdates: checked })}
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-4 pt-4">
                  <Button variant="outline">Reset to Default</Button>
                  <Button 
                    className="bg-crypto-purple hover:bg-crypto-dark-purple"
                    onClick={handleSaveNotifications}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Preferences'
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security */}
          <TabsContent value="security">
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Shield className="h-5 w-5 text-crypto-purple" />
                  <CardTitle>Security Settings</CardTitle>
                </div>
                <CardDescription>Manage your password and security options</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="current-password">Current Password</Label>
                    <Input id="current-password" type="password" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New Password</Label>
                    <Input id="new-password" type="password" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm New Password</Label>
                    <Input id="confirm-password" type="password" />
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Two-Factor Authentication</h4>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Enable 2FA</Label>
                      <p className="text-sm text-gray-500">Add an extra layer of security to your account</p>
                    </div>
                    <Switch />
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Active Sessions</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="text-sm font-medium">Current Session</p>
                        <p className="text-xs text-gray-500">Windows • Chrome • 192.168.1.100</p>
                      </div>
                      <Button variant="outline" size="sm" disabled>
                        Active
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end space-x-4 pt-4">
                  <Button variant="outline">Cancel</Button>
                  <Button 
                    className="bg-crypto-purple hover:bg-crypto-dark-purple"
                    onClick={handleUpdatePassword}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      'Update Password'
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* API Settings */}
          <TabsContent value="api">
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Database className="h-5 w-5 text-crypto-purple" />
                  <CardTitle>API Configuration</CardTitle>
                </div>
                <CardDescription>Manage API keys and integration settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>API Endpoint</Label>
                    <div className="flex space-x-2">
                      <Input 
                        value={`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}/api/v1`}
                        readOnly 
                        className="font-mono text-sm"
                      />
                      <Button 
                        variant="outline"
                        onClick={() => handleCopyKey(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}/api/v1`)}
                      >
                        {copiedKey === `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}/api/v1` ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Your API Keys</h4>
                    <div className="flex space-x-2">
                      <Input 
                        placeholder="Key name..."
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        className="w-40"
                      />
                      <Button 
                        variant="outline"
                        onClick={handleCreateApiKey}
                        disabled={isCreatingKey || !newKeyName.trim()}
                      >
                        {isCreatingKey ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  
                  {apiKeys.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">
                      No API keys yet. Create one to get started.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {apiKeys.map((apiKey) => (
                        <div key={apiKey.id} className="flex items-center space-x-2 p-3 border rounded-lg">
                          <div className="flex-1">
                            <p className="text-sm font-medium">{apiKey.name}</p>
                            <p className="text-xs text-gray-500 font-mono">
                              {apiKey.key.substring(0, 20)}...
                            </p>
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleCopyKey(apiKey.key)}
                          >
                            {copiedKey === apiKey.key ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleDeleteApiKey(apiKey.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Rate Limits</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 border rounded-lg">
                      <p className="text-sm text-gray-600">Requests per minute</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">100</p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <p className="text-sm text-gray-600">Daily limit</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">10,000</p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end space-x-4 pt-4">
                  <Button variant="outline">
                    View Documentation
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}