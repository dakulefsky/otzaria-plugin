using System.Diagnostics;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace OtzariaBridgeManager;

internal static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new ManagerForm());
    }
}

internal sealed class ManagerForm : Form
{
    readonly TextBox tunnelId = Field("tunnel_…");
    readonly TextBox apiKey = Field("Runtime API key (encrypted locally)");
    readonly TextBox tunnelExe = Field("Path to official tunnel-client.exe");
    readonly TextBox nodeExe = Field("Path to node.exe (v20+)");
    readonly TextBox companion = Field("Path to companion dist/index.js");
    readonly Label status = new() { AutoSize = true, Text = "Not configured", Padding = new Padding(0, 8, 0, 8) };
    readonly Button start = new() { Text = "Save & Start", AutoSize = true };
    readonly Button stop = new() { Text = "Stop", AutoSize = true, Enabled = false };
    readonly Button health = new() { Text = "Check health", AutoSize = true };
    Process? process;
    readonly string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OtzariaBridge");
    readonly string secretFile;
    readonly string profileFile;

    public ManagerForm()
    {
        Text = "Otzaria Test Bridge";
        Width = 760; Height = 500; MinimumSize = new Size(650, 420);
        StartPosition = FormStartPosition.CenterScreen;
        apiKey.UseSystemPasswordChar = true;
        secretFile = Path.Combine(root, "runtime-key.dpapi");
        profileFile = Path.Combine(root, "otzaria.yaml");
        Directory.CreateDirectory(root);
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(18), ColumnCount = 2, AutoScroll = true };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 180));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        Controls.Add(layout);
        AddRow(layout, "OpenAI tunnel ID", tunnelId);
        AddRow(layout, "Runtime API key", apiKey);
        AddRow(layout, "Tunnel client", BrowseRow(tunnelExe, "tunnel-client.exe"));
        AddRow(layout, "Node.js runtime", BrowseRow(nodeExe, "node.exe"));
        AddRow(layout, "Companion entry point", BrowseRow(companion, "index.js"));
        var note = new Label { AutoSize = true, MaximumSize = new Size(510, 0), Text = "The API key is encrypted with Windows DPAPI for this Windows account. It is injected only into the tunnel process environment; it is never written to the profile or command line. The companion remains local to this PC." };
        AddRow(layout, "Security", note);
        var buttons = new FlowLayoutPanel { AutoSize = true, FlowDirection = FlowDirection.LeftToRight };
        buttons.Controls.AddRange([start, stop, health]);
        AddRow(layout, "Controls", buttons);
        AddRow(layout, "Status", status);
        start.Click += async (_, _) => await StartTunnel();
        stop.Click += (_, _) => StopTunnel();
        health.Click += async (_, _) => await CheckHealth();
        FormClosing += (_, _) => StopTunnel();
        LoadSaved();
    }

    static TextBox Field(string placeholder) => new() { Dock = DockStyle.Fill, PlaceholderText = placeholder };
    static void AddRow(TableLayoutPanel p, string label, Control control)
    {
        int r = p.RowCount++;
        p.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        p.Controls.Add(new Label { Text = label, AutoSize = true, Anchor = AnchorStyles.Left, Padding = new Padding(0, 8, 8, 8) }, 0, r);
        control.Margin = new Padding(3, 5, 3, 5);
        p.Controls.Add(control, 1, r);
    }
    Control BrowseRow(TextBox box, string filter)
    {
        var panel = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, AutoSize = true };
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        var button = new Button { Text = "Browse…", AutoSize = true };
        button.Click += (_, _) => { using var d = new OpenFileDialog { Filter = filter + "|" + filter + "|All files|*.*" }; if (d.ShowDialog(this) == DialogResult.OK) box.Text = d.FileName; };
        panel.Controls.Add(box, 0, 0); panel.Controls.Add(button, 1, 0); return panel;
    }
    void LoadSaved()
    {
        if (!File.Exists(profileFile)) return;
        try
        {
            var yaml = File.ReadAllText(profileFile);
            var match = System.Text.RegularExpressions.Regex.Match(yaml, @"tunnel_id:\s*""([^""]+)""");
            if (match.Success) tunnelId.Text = match.Groups[1].Value;
        }
        catch { }
    }
    static string Q(string s) => JsonSerializer.Serialize(s);
    async Task StartTunnel()
    {
        try
        {
            StopTunnel();
            if (!tunnelId.Text.StartsWith("tunnel_", StringComparison.Ordinal) || tunnelId.Text.Length < 20) throw new Exception("Enter a valid tunnel ID from Platform.");
            if (string.IsNullOrWhiteSpace(apiKey.Text) && !File.Exists(secretFile)) throw new Exception("Enter the runtime API key.");
            foreach (var path in new[] { tunnelExe.Text, nodeExe.Text, companion.Text })
                if (!File.Exists(path)) throw new Exception("File not found: " + path);
            var version = await RunCapture(nodeExe.Text, "--version");
            if (!Version.TryParse(version.Trim().TrimStart('v'), out var v) || v < new Version(20, 0)) throw new Exception("Node.js 20 or newer is required.");
            if (!string.IsNullOrWhiteSpace(apiKey.Text))
            {
                var protectedBytes = ProtectedData.Protect(Encoding.UTF8.GetBytes(apiKey.Text), null, DataProtectionScope.CurrentUser);
                File.WriteAllBytes(secretFile, protectedBytes);
                apiKey.Clear();
            }
            var command = Q(nodeExe.Text) + " " + Q(companion.Text);
            var yaml = $@"config_version: 1
control_plane:
  base_url: ""https://api.openai.com""
  tunnel_id: {Q(tunnelId.Text.Trim())}
  api_key: ""env:CONTROL_PLANE_API_KEY""
health:
  listen_addr: ""127.0.0.1:47616""
log:
  level: info
  format: json
mcp:
  commands:
    - channel: main
      command: {Q(command)}
";
            File.WriteAllText(profileFile, yaml, new UTF8Encoding(false));
            var key = Encoding.UTF8.GetString(ProtectedData.Unprotect(File.ReadAllBytes(secretFile), null, DataProtectionScope.CurrentUser));
            var psi = new ProcessStartInfo(tunnelExe.Text) { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = Path.GetDirectoryName(tunnelExe.Text)! };
            psi.ArgumentList.Add("run"); psi.ArgumentList.Add("--profile-file"); psi.ArgumentList.Add(profileFile);
            psi.Environment["CONTROL_PLANE_API_KEY"] = key;
            process = Process.Start(psi) ?? throw new Exception("Could not start tunnel-client.");
            _ = Task.Run(async () => { try { var p = process; await p!.WaitForExitAsync(); if (IsHandleCreated) BeginInvoke(() => { status.Text = "Tunnel stopped (exit " + p.ExitCode + ")"; start.Enabled = true; stop.Enabled = false; }); } catch { } });
            status.Text = "Tunnel process started. Checking readiness…";
            start.Enabled = false; stop.Enabled = true;
            await Task.Delay(1800);
            await CheckHealth();
        }
        catch (Exception ex) { status.Text = "Setup error: " + ex.Message; MessageBox.Show(this, ex.Message, "Otzaria Test Bridge", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }
    static async Task<string> RunCapture(string exe, string args)
    {
        var p = Process.Start(new ProcessStartInfo(exe, args) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true })!;
        var output = await p.StandardOutput.ReadToEndAsync(); await p.WaitForExitAsync();
        if (p.ExitCode != 0) throw new Exception("Could not run " + exe + ": " + await p.StandardError.ReadToEndAsync());
        return output;
    }
    async Task CheckHealth()
    {
        try
        {
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
            var response = await client.GetAsync("http://127.0.0.1:47616/healthz");
            status.Text = response.IsSuccessStatusCode ? "Tunnel-client healthy. Confirm readiness in its local status page." : "Tunnel-client responded: " + (int)response.StatusCode;
        }
        catch { status.Text = process is { HasExited: false } ? "Tunnel process is running; health endpoint is not ready yet." : "Tunnel is not running."; }
    }
    void StopTunnel()
    {
        try { if (process is { HasExited: false }) process.Kill(true); } catch { }
        process?.Dispose(); process = null;
        start.Enabled = true; stop.Enabled = false;
        if (status.IsHandleCreated) status.Text = "Stopped";
    }
}
