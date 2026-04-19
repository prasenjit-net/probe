use std::{env, fs, path::PathBuf};

const PLACEHOLDER_INDEX: &str = r#"<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Probe UI not built</title>
  </head>
  <body>
    <h1>Probe UI assets are not built</h1>
    <p>Run <code>cd ui && npm run build</code> to generate the frontend bundle.</p>
  </body>
</html>
"#;

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=ui/dist");

    let manifest_dir =
        PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is set"));
    let dist_dir = manifest_dir.join("ui").join("dist");
    let index_path = dist_dir.join("index.html");

    fs::create_dir_all(&dist_dir).expect("create ui/dist directory");

    if !index_path.exists() {
        fs::write(&index_path, PLACEHOLDER_INDEX).expect("write placeholder ui/dist/index.html");
    }
}
