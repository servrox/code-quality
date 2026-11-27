[
  .[][]
  | select(
      .merged_at != null and .merge_commit_sha == $sha
      and .base.ref == "main" and .base.repo.full_name == $repo
      and .head.repo.full_name == $repo
      and (.head.ref | test("^release-please--branches--main($|--components--)"))
      and .user.type == "Bot" and .user.login == ($app + "[bot]")
    )
] | if length == 1 then .[0] else error("Expected one merged Release Please App PR for this commit") end
