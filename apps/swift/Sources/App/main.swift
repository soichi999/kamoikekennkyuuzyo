import Frontend

let frontend = Frontend()
let pairing = try await frontend.createPairing()
print("ペアリングコード発行: \(pairing.code) / family_id: \(pairing.familyId)")
