# Hollow Knight: Silksong Game Pass Save Exporter

[Download](../../releases) • [Documentation](src/TECHNICAL.md) • [Report Bugs](../../issues)

#### Export your saves from Game Pass to Steam-compatible format

I haven't tested it, but this should work with Hollow Knight saves as well.

## 🚀 Quick start

#### Option 1: Run the executable (Recommended)

1. Download `silksong-wgs-exporter.exe` from the [latest release](../../releases)
2. Double-click to run
3. Find your saves in the `exported_save_files/` folder, created in the same directory as the executable.

#### Option 2: Run it from source

```bash
npm install
node src/index.js
```

## 📁 What gets exported

```
exported_save_files/
├── user1.dat, user2.dat, ...                  # Save slots
├── shared.dat
└── Restore_Points1/, Restore_Points2/, ...    # Restore points
```

## 🛠️ Build the executable

```bash
npm run build  # Creates build/silksong-wgs-exporter.exe
```

Requires Node.js 20+. Uses [Node.js SEA](https://nodejs.org/api/single-executable-applications.html) for standalone executables.

## 📚 Documentation

For technical details about the WGS container format and API reference, see [src/TECHNICAL.md](src/TECHNICAL.md).

## 🤝 Contributing

Contributions welcome! Feel free to open an issue or submit a pull request.

### 📄 License

MIT © [saiki-k](https://github.com/saiki-k)
