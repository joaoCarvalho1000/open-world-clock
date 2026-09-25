// swift-tools-version:5.9
// WorldClockCore: pure-Swift, Foundation-only core shared by the Open World Clock iOS app and its widgets.
// Builds and tests on Apple platforms, Linux and Windows (swift-corelibs-foundation / swift-foundation).
//
// Resources are COPIES of ../../shared/*.json (generated from the JS sources). Regenerate with:
//   node scripts/export-shared.mjs && node apple/WorldClockCore/sync-resources.mjs
import PackageDescription

let package = Package(
    name: "WorldClockCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "WorldClockCore", targets: ["WorldClockCore"]),
    ],
    targets: [
        .target(
            name: "WorldClockCore",
            resources: [
                .copy("Resources/zones.json"),
                .copy("Resources/world-land.json"),
            ]
        ),
        .testTarget(
            name: "WorldClockCoreTests",
            dependencies: ["WorldClockCore"],
            resources: [
                .copy("Resources/golden.json"),
            ]
        ),
    ]
)
