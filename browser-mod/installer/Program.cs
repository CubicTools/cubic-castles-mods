using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

[assembly: AssemblyTitle("Cubic Castles Browser Mods Installer")]
[assembly: AssemblyDescription("Installs Cubic Castles Browser Mods into a user-selected Chromium profile")]
[assembly: AssemblyCompany("Cubic Castles Browser Mods")]
[assembly: AssemblyProduct("Cubic Castles Browser Mods Installer")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

internal static class Program
{
    private const string ScriptResource = "Installer.install.ps1";
    private const string ManifestResource = "Installer.manifest.json";
    private const string PackageResource = "Installer.browser-mod.zip";

    [STAThread]
    private static int Main(string[] arguments)
    {
        string temporaryRoot = null;
        try
        {
            Console.Title = "Cubic Castles Browser Mods Installer";
            temporaryRoot = Path.Combine(
                Path.GetTempPath(),
                "cc-browser-mod-installer-" + Guid.NewGuid().ToString("N"));

            string extensionSource = Path.Combine(temporaryRoot, "webtools", "browser-mod");
            string releaseDirectory = Path.Combine(temporaryRoot, "stage2", "release", "files");
            Directory.CreateDirectory(extensionSource);
            Directory.CreateDirectory(releaseDirectory);

            string scriptPath = Path.Combine(extensionSource, "install.ps1");
            string manifestPath = Path.Combine(extensionSource, "manifest.json");
            ExtractResource(ScriptResource, scriptPath);
            ExtractResource(ManifestResource, manifestPath);

            string version = ReadManifestVersion(manifestPath);
            string packagePath = Path.Combine(
                releaseDirectory,
                "browser-mod-" + version + ".zip");
            ExtractResource(PackageResource, packagePath);

            string systemDirectory = Environment.GetFolderPath(Environment.SpecialFolder.System);
            string powershell = Path.Combine(
                systemDirectory,
                "WindowsPowerShell",
                "v1.0",
                "powershell.exe");
            if (!File.Exists(powershell))
            {
                powershell = "powershell.exe";
            }

            ProcessStartInfo startInfo = new ProcessStartInfo();
            startInfo.FileName = powershell;
            StringBuilder commandLine = new StringBuilder();
            commandLine.Append("-NoLogo -NoProfile -ExecutionPolicy Bypass -File ");
            commandLine.Append(Quote(scriptPath));
            commandLine.Append(" -Pause");
            foreach (string argument in arguments)
            {
                commandLine.Append(" ");
                commandLine.Append(Quote(argument));
            }
            startInfo.Arguments = commandLine.ToString();
            startInfo.UseShellExecute = false;
            startInfo.CreateNoWindow = false;

            using (Process installer = Process.Start(startInfo))
            {
                if (installer == null)
                {
                    throw new InvalidOperationException("Windows could not start the installer process.");
                }
                installer.WaitForExit();
                return installer.ExitCode;
            }
        }
        catch (Exception error)
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine();
            Console.WriteLine("INSTALLER ERROR: " + error.Message);
            Console.ResetColor();
            Console.WriteLine();
            Console.WriteLine("Press Enter to close.");
            Console.ReadLine();
            return 1;
        }
        finally
        {
            DeleteTemporaryFiles(temporaryRoot);
        }
    }

    private static void ExtractResource(string resourceName, string destination)
    {
        Assembly assembly = Assembly.GetExecutingAssembly();
        using (Stream source = assembly.GetManifestResourceStream(resourceName))
        {
            if (source == null)
            {
                throw new InvalidOperationException(
                    "The installer is missing its embedded resource: " + resourceName);
            }
            using (FileStream target = new FileStream(
                destination,
                FileMode.Create,
                FileAccess.Write,
                FileShare.None))
            {
                source.CopyTo(target);
            }
        }
    }

    private static string ReadManifestVersion(string manifestPath)
    {
        string json = File.ReadAllText(manifestPath, Encoding.UTF8);
        Match match = Regex.Match(json, "\\\"version\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"");
        if (!match.Success)
        {
            throw new InvalidDataException("The embedded extension manifest has no version.");
        }
        return match.Groups[1].Value;
    }

    private static string Quote(string value)
    {
        return "\"" + value.Replace("\"", "\\\"") + "\"";
    }

    private static void DeleteTemporaryFiles(string path)
    {
        if (String.IsNullOrEmpty(path) || !Directory.Exists(path))
        {
            return;
        }

        for (int attempt = 0; attempt < 3; attempt++)
        {
            try
            {
                Directory.Delete(path, true);
                return;
            }
            catch
            {
                Thread.Sleep(250);
            }
        }
    }
}
