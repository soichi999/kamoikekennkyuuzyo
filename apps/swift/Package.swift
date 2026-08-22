// swift-tools-version: 6.3
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "鴨池研究所",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    targets: [
        // Backend: データ処理・ロジック
        .target(
            name: "Backend"
        ),
        .testTarget(
            name: "BackendTests",
            dependencies: ["Backend"]
        ),

        // Frontend: 画面表示・入出力(Backendに依存)
        .target(
            name: "Frontend",
            dependencies: ["Backend"]
        ),
        .testTarget(
            name: "FrontendTests",
            dependencies: ["Frontend"]
        ),

        // App: エントリーポイント
        .executableTarget(
            name: "App",
            dependencies: ["Frontend"]
        ),
    ],
    swiftLanguageModes: [.v6]
)
