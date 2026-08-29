{
  lib,
  stdenv,
  bun,
  cacert,
  makeWrapper,
  git,
  gh,
  version ? "0.1.0",
}:

let
  # ビルドに要るものだけを含める。ドキュメントを直しても再ビルドされない。
  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [
      ../package.json
      ../bun.lock
      ../tsconfig.json
      ../src
      ../tests
    ];
  };

  # 依存の取得はネットワークが要るため fixed-output derivation に分ける。
  # 依存が変わらない限り再取得されない。
  #
  # bun.lock はテキスト形式（Bun 1.2 以降）。nixpkgs 24.11 の bun は 1.1 系で
  # これを読めないため、この derivation は unstable の bun で評価すること。
  nodeModules = stdenv.mkDerivation {
    pname = "autopilot-node-modules";
    inherit version;
    src = lib.fileset.toSource {
      root = ../.;
      fileset = lib.fileset.unions [
        ../package.json
        ../bun.lock
      ];
    };

    nativeBuildInputs = [
      bun
      cacert
    ];
    dontConfigure = true;

    buildPhase = ''
      runHook preBuild
      export HOME=$TMPDIR
      export BUN_INSTALL_CACHE_DIR=$TMPDIR/bun-cache
      bun install --frozen-lockfile --production --no-progress --ignore-scripts
      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall
      mkdir -p $out
      cp -R node_modules/. $out/
      runHook postInstall
    '';

    dontFixup = true;
    outputHashAlgo = "sha256";
    outputHashMode = "recursive";
    outputHash = "sha256-Wy2SbyZ9U7g1dGskMDofT3Ko2tiUK2mK1sDeBS4mCfM=";
  };
in
stdenv.mkDerivation {
  pname = "autopilot";
  inherit version src;

  nativeBuildInputs = [
    bun
    makeWrapper
    git
    gh
  ];

  dontConfigure = true;

  # bun build --compile で末尾に付加される JavaScript バンドルが
  # Nix の strip や patchelf (fixupPhase) で切り落とされて素の bun に戻るのを防ぐ
  dontStrip = true;
  dontPatchELF = true;

  buildPhase = ''
    runHook preBuild
    export HOME=$TMPDIR
    cp -R ${nodeModules} node_modules
    chmod -R u+w node_modules

    # 不変条件のテスト。GitHub にもエージェントにも触らないので sandbox 内で走る。
    bun test

    # SPA 資産も含めて単一バイナリに埋め込む。別途のファイル配置は要らない。
    bun build --compile --outfile autopilot src/main.ts
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p $out/bin
    install -m755 autopilot $out/bin/autopilot

    # エージェントは gh でコメント投稿と PR 作成を行い、
    # ワークスペースの初期化は git を直接叩く（spec.md §8）。実行時 PATH に必ず入れる。
    wrapProgram $out/bin/autopilot \
      --prefix PATH : ${
        lib.makeBinPath [
          git
          gh
        ]
      }
    runHook postInstall
  '';

  meta = {
    description = "GitHub の Issue / PR を真実源とする自動開発パイプラインの常駐ワーカー";
    mainProgram = "autopilot";
    platforms = lib.platforms.unix;
  };
}
