"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  User,
  Bell,
  Monitor,
  Save,
  Plus,
  Trash2,
} from "lucide-react";

// ---------- types ----------
interface AlertRule {
  id: string;
  type: string;
  channel: string;
  filters: string;
  threshold: number;
  active: boolean;
}

// ---------- component ----------
export default function SettingsPage() {
  // Profile state
  const [profileName, setProfileName] = useState("John Anderson");
  const [profileEmail, setProfileEmail] = useState("john@foreclosureflipradar.com");
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [smsNotifs, setSmsNotifs] = useState(false);
  const [slackNotifs, setSlackNotifs] = useState(true);

  // Alert rules state
  const [alertRules, setAlertRules] = useState<AlertRule[]>([
    {
      id: "ar1",
      type: "New Listing",
      channel: "Email",
      filters: "Greenville County, Score > 70",
      threshold: 70,
      active: true,
    },
    {
      id: "ar2",
      type: "Auction Date",
      channel: "SMS",
      filters: "All Counties, Within 3 days",
      threshold: 3,
      active: true,
    },
    {
      id: "ar3",
      type: "Price Drop",
      channel: "Slack",
      filters: "Horry County, Drop > 10%",
      threshold: 10,
      active: false,
    },
  ]);

  // New alert dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newAlertType, setNewAlertType] = useState("New Listing");
  const [newAlertChannel, setNewAlertChannel] = useState("Email");
  const [newAlertFilters, setNewAlertFilters] = useState("");
  const [newAlertThreshold, setNewAlertThreshold] = useState("70");

  // Display state
  const [defaultCounty, setDefaultCounty] = useState("Greenville");
  const [defaultSort, setDefaultSort] = useState("score_desc");
  const [itemsPerPage, setItemsPerPage] = useState("25");

  function toggleAlertActive(id: string) {
    setAlertRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, active: !r.active } : r))
    );
  }

  function deleteAlertRule(id: string) {
    setAlertRules((prev) => prev.filter((r) => r.id !== id));
  }

  function addAlertRule() {
    const newRule: AlertRule = {
      id: `ar-${Date.now()}`,
      type: newAlertType,
      channel: newAlertChannel,
      filters: newAlertFilters || "All Counties",
      threshold: parseInt(newAlertThreshold, 10) || 0,
      active: true,
    };
    setAlertRules((prev) => [...prev, newRule]);
    setDialogOpen(false);
    setNewAlertType("New Listing");
    setNewAlertChannel("Email");
    setNewAlertFilters("");
    setNewAlertThreshold("70");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your profile, alerts, and display preferences."
      />

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile" className="gap-1">
            <User className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-1">
            <Bell className="h-4 w-4" />
            Alerts
          </TabsTrigger>
          <TabsTrigger value="display" className="gap-1">
            <Monitor className="h-4 w-4" />
            Display
          </TabsTrigger>
        </TabsList>

        {/* ==================== PROFILE TAB ==================== */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>
                Update your name, email, and notification preferences.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="profile-name">Full Name</Label>
                  <Input
                    id="profile-name"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="Your name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-email">Email Address</Label>
                  <Input
                    id="profile-email"
                    type="email"
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Notification Preferences</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <Label htmlFor="email-notifs" className="font-medium">
                        Email Notifications
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Receive alerts and updates via email
                      </p>
                    </div>
                    <Switch
                      id="email-notifs"
                      checked={emailNotifs}
                      onCheckedChange={setEmailNotifs}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <Label htmlFor="sms-notifs" className="font-medium">
                        SMS Notifications
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Get text messages for urgent alerts
                      </p>
                    </div>
                    <Switch
                      id="sms-notifs"
                      checked={smsNotifs}
                      onCheckedChange={setSmsNotifs}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <Label htmlFor="slack-notifs" className="font-medium">
                        Slack Notifications
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Post alerts to your Slack workspace
                      </p>
                    </div>
                    <Switch
                      id="slack-notifs"
                      checked={slackNotifs}
                      onCheckedChange={setSlackNotifs}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button>
                  <Save className="mr-1 h-4 w-4" />
                  Save Profile
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== ALERTS TAB ==================== */}
        <TabsContent value="alerts">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Alert Rules</CardTitle>
                  <CardDescription>
                    Configure automated alerts for new opportunities, price
                    changes, and auction deadlines.
                  </CardDescription>
                </div>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="mr-1 h-4 w-4" />
                      Add Alert Rule
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Alert Rule</DialogTitle>
                      <DialogDescription>
                        Create a new alert rule to be notified when conditions
                        are met.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label>Alert Type</Label>
                        <Select
                          value={newAlertType}
                          onValueChange={setNewAlertType}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="New Listing">
                              New Listing
                            </SelectItem>
                            <SelectItem value="Price Drop">
                              Price Drop
                            </SelectItem>
                            <SelectItem value="Auction Date">
                              Auction Date
                            </SelectItem>
                            <SelectItem value="Status Change">
                              Status Change
                            </SelectItem>
                            <SelectItem value="Score Threshold">
                              Score Threshold
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Channel</Label>
                        <Select
                          value={newAlertChannel}
                          onValueChange={setNewAlertChannel}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Email">Email</SelectItem>
                            <SelectItem value="SMS">SMS</SelectItem>
                            <SelectItem value="Slack">Slack</SelectItem>
                            <SelectItem value="Push">Push</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-alert-filters">
                          Filters (e.g., county, conditions)
                        </Label>
                        <Input
                          id="new-alert-filters"
                          value={newAlertFilters}
                          onChange={(e) => setNewAlertFilters(e.target.value)}
                          placeholder="Greenville County, Score > 70"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-alert-threshold">Threshold</Label>
                        <Input
                          id="new-alert-threshold"
                          type="number"
                          value={newAlertThreshold}
                          onChange={(e) =>
                            setNewAlertThreshold(e.target.value)
                          }
                          placeholder="70"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button onClick={addAlertRule}>Add Rule</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {alertRules.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Bell className="mb-3 h-10 w-10 text-muted-foreground opacity-40" />
                  <p className="text-muted-foreground">
                    No alert rules configured.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Filters</TableHead>
                      <TableHead>Threshold</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alertRules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell>
                          <Badge variant="outline">{rule.type}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{rule.channel}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {rule.filters}
                        </TableCell>
                        <TableCell className="font-medium">
                          {rule.threshold}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={rule.active}
                            onCheckedChange={() => toggleAlertActive(rule.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteAlertRule(rule.id)}
                          >
                            <Trash2 className="mr-1 h-4 w-4" />
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <div className="mt-4 flex justify-end">
            <Button>
              <Save className="mr-1 h-4 w-4" />
              Save Alerts
            </Button>
          </div>
        </TabsContent>

        {/* ==================== DISPLAY TAB ==================== */}
        <TabsContent value="display">
          <Card>
            <CardHeader>
              <CardTitle>Display Preferences</CardTitle>
              <CardDescription>
                Customize your default view settings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Default County</Label>
                  <Select
                    value={defaultCounty}
                    onValueChange={setDefaultCounty}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Counties</SelectItem>
                      <SelectItem value="Greenville">Greenville</SelectItem>
                      <SelectItem value="Horry">Horry</SelectItem>
                      <SelectItem value="Charleston">Charleston</SelectItem>
                      <SelectItem value="Richland">Richland</SelectItem>
                      <SelectItem value="Spartanburg">Spartanburg</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Default Sort</Label>
                  <Select value={defaultSort} onValueChange={setDefaultSort}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="score_desc">
                        Score (High to Low)
                      </SelectItem>
                      <SelectItem value="score_asc">
                        Score (Low to High)
                      </SelectItem>
                      <SelectItem value="date_asc">
                        Date (Soonest First)
                      </SelectItem>
                      <SelectItem value="date_desc">
                        Date (Latest First)
                      </SelectItem>
                      <SelectItem value="price_asc">
                        Price (Low to High)
                      </SelectItem>
                      <SelectItem value="price_desc">
                        Price (High to Low)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Items Per Page</Label>
                  <Select
                    value={itemsPerPage}
                    onValueChange={setItemsPerPage}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end">
                <Button>
                  <Save className="mr-1 h-4 w-4" />
                  Save Display Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
