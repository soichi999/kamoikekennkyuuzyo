import Testing
@testable import Backend

@Test func backendGreets() {
    #expect(Backend().greet() == "Hello from Backend")
}
