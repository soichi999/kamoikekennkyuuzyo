import Foundation

/// アプリ全体で使う家族ID/子どもID等の永続状態。
/// ペアリング完了時に保存し、以後の画面はここから読み出す。
@MainActor
@Observable
public final class AppSession {
    private enum Keys {
        static let familyId = "kamoike.familyId"
        static let selectedChildId = "kamoike.selectedChildId"
    }

    public private(set) var familyId: String?
    public var selectedChildId: String?

    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.familyId = defaults.string(forKey: Keys.familyId)
        self.selectedChildId = defaults.string(forKey: Keys.selectedChildId)
    }

    public func setFamilyId(_ familyId: String) {
        self.familyId = familyId
        defaults.set(familyId, forKey: Keys.familyId)
    }

    public func selectChild(_ childId: String) {
        selectedChildId = childId
        defaults.set(childId, forKey: Keys.selectedChildId)
    }

    public func signOut() {
        familyId = nil
        selectedChildId = nil
        defaults.removeObject(forKey: Keys.familyId)
        defaults.removeObject(forKey: Keys.selectedChildId)
    }
}
