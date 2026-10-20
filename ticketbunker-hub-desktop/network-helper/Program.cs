using System.Collections.Concurrent;
using System.Text.Json;
using Windows.Devices.WiFiDirect;

// Only owns the AP created by this process. Never changes the user's saved
// network profiles or enables internet sharing. Exiting releases the AP.
internal static class Program
{
    private static readonly object OutputLock = new();
    private static readonly ConcurrentBag<WiFiDirectDevice> Peers = new();
    private static void Report(string state)
    {
        lock (OutputLock) { Console.WriteLine(JsonSerializer.Serialize(new { state })); Console.Out.Flush(); }
    }
    private static async Task<int> Main()
    {
        WiFiDirectAdvertisementPublisher? publisher = null;
        WiFiDirectConnectionListener? listener = null;
        try
        {
            var input = await Console.In.ReadLineAsync();
            using var document = JsonDocument.Parse(input ?? "{}");
            var ssid = document.RootElement.GetProperty("ssid").GetString();
            var password = document.RootElement.GetProperty("password").GetString();
            if (ssid is null || !System.Text.RegularExpressions.Regex.IsMatch(ssid, "^TicketBunker-[A-F0-9]{6}$") || password is null || !System.Text.RegularExpressions.Regex.IsMatch(password, "^[A-Za-z0-9_-]{16}$")) throw new InvalidOperationException();
            publisher = new WiFiDirectAdvertisementPublisher();
            publisher.Advertisement.IsAutonomousGroupOwnerEnabled = true;
            publisher.Advertisement.LegacySettings.IsEnabled = true;
            publisher.Advertisement.LegacySettings.Ssid = ssid;
            publisher.Advertisement.LegacySettings.Passphrase.Password = password;
            listener = new WiFiDirectConnectionListener();
            listener.ConnectionRequested += async (_, args) =>
            {
                try
                {
                    using var request = args.GetConnectionRequest();
                    var device = await WiFiDirectDevice.FromIdAsync(request.DeviceInformation.Id);
                    if (device is not null) Peers.Add(device);
                }
                catch { /* A failed radio connection is never a ticket approval. */ }
            };
            publisher.StatusChanged += (_, args) =>
            {
                if (args.Status == WiFiDirectAdvertisementPublisherStatus.Started) Report("started");
                else if (args.Status == WiFiDirectAdvertisementPublisherStatus.Aborted) Report("failed");
                else if (args.Status == WiFiDirectAdvertisementPublisherStatus.Stopped) Report("stopped");
            };
            publisher.Start();
            // The desktop keeps stdin open. EOF or process termination releases
            // this network; credentials never reach the command line or disk.
            while (await Console.In.ReadLineAsync() is not null) { }
            return 0;
        }
        catch { Report("failed"); return 1; }
        finally
        {
            try { publisher?.Stop(); } catch { }
            while (Peers.TryTake(out var peer)) peer.Dispose();
            GC.KeepAlive(listener);
        }
    }
}
