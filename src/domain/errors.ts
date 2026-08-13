export class InvalidContributionError extends Error {
  override name = "InvalidContributionError";
}

export class ClaimNotFoundError extends Error {
  override name = "ClaimNotFoundError";
}

export class IndependentVerificationError extends Error {
  override name = "IndependentVerificationError";
}
