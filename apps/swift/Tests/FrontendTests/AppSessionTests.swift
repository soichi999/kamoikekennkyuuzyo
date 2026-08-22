import Testing
import Foundation
@testable import Frontend

@MainActor
struct AppSessionTests {
    @Test func persistsFamilyAndChildAcrossInstances() {
        let suiteName = "AppSessionTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defer { defaults.removePersistentDomain(forName: suiteName) }

        let session1 = AppSession(defaults: defaults)
        session1.setFamilyId("fam_123")
        session1.selectChild("child_456")

        let session2 = AppSession(defaults: defaults)
        #expect(session2.familyId == "fam_123")
        #expect(session2.selectedChildId == "child_456")

        session2.signOut()
        let session3 = AppSession(defaults: defaults)
        #expect(session3.familyId == nil)
        #expect(session3.selectedChildId == nil)
    }
}
