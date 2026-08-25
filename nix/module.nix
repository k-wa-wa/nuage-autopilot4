# autopilot を systemd の常駐サービスとして動かす NixOS モジュール。
{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.autopilot;
  yamlFormat = pkgs.formats.yaml { };

  configFile =
    if cfg.configFile != null then cfg.configFile else yamlFormat.generate "autopilot-config.yaml" cfg.settings;
in
{
  options.services.autopilot = {
    enable = lib.mkEnableOption "autopilot（自動開発パイプラインの常駐ワーカー）";

    package = lib.mkOption {
      type = lib.types.package;
      description = "使用する autopilot パッケージ。";
    };

    user = lib.mkOption {
      type = lib.types.str;
      default = "autopilot";
      description = ''
        サービスを実行するユーザー。

        コーディングエージェント CLI（claude 等）をユーザーのホームに入れている場合は、
        そのユーザーを指定し {option}`services.autopilot.createUser` を false にする。
      '';
    };

    group = lib.mkOption {
      type = lib.types.str;
      default = cfg.user;
      defaultText = lib.literalExpression "config.services.autopilot.user";
      description = "サービスを実行するグループ。";
    };

    createUser = lib.mkOption {
      type = lib.types.bool;
      default = cfg.user == "autopilot";
      defaultText = lib.literalExpression ''config.services.autopilot.user == "autopilot"'';
      description = "ユーザーとグループをこのモジュールで作成するかどうか。";
    };

    stateDir = lib.mkOption {
      type = lib.types.path;
      default = "/var/lib/autopilot";
      description = ''
        AUTOPILOT_HOME。DB・ワークスペース・ログ・実行時ファイル・ロックの置き場。

        autopilot はこの 1 か所からすべての置き場を導出する
        （`autopilot.db` / `workspaces/` / `logs/` / `run/` / `autopilot.lock`）。
        設定ファイル側に個別のパスを書く項目は無い。
      '';
    };

    environmentFile = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      example = "/var/lib/autopilot/secrets.env";
      description = ''
        GH_TOKEN を渡すための EnvironmentFile。

        **専用 bot アカウント**のトークンを置くこと。人間本人のトークンを置くと
        自分の投稿を自分で検知して無限ループになるため、doctor が起動を拒否する。

        **Nix ストアに置かないこと**（誰でも読める）。sops-nix 等で配置したパスを指定する。

        ```
        GH_TOKEN=ghp_xxxxxxxxxxxx
        ```
      '';
    };

    openFirewall = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = ''
        Dashboard のポートを開放するかどうか。

        Dashboard は認証を持たないため既定では 127.0.0.1 にしか bind しない。
        開放する場合は {option}`services.autopilot.settings.dashboard.host` も
        `0.0.0.0` にすること。書き込み API は無いので、影響は
        「Issue の題名と状態が読まれる」までに閉じている。

        開放せずにリモートから見るなら SSH ポートフォワードを使う:

        ```
        ssh -L 8787:127.0.0.1:8787 autopilot-server
        ```
      '';
    };

    extraPackages = lib.mkOption {
      type = lib.types.listOf lib.types.package;
      default = [ ];
      example = lib.literalExpression "[ pkgs.nodejs_22 pkgs.python3 ]";
      description = ''
        PATH に追加するパッケージ。

        git と gh はパッケージ側で常に含まれる。対象リポジトリのテストやビルドに
        必要なツールをここに足す。足りないとエージェントが助言待ちで止まる。
      '';
    };

    extraPath = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ ];
      example = [ "/home/nixos/.local" ];
      description = ''
        PATH に追加する生のディレクトリ。

        Nix 管理外のコーディングエージェント CLI（claude 等）を置いている場所を指定する。
        systemd の path= は `<dir>/bin` を PATH に加えるため、`/home/nixos/.local` を
        指定すると `/home/nixos/.local/bin` が通る。
      '';
    };

    configFile = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      description = ''
        設定ファイルを直接指定する場合のパス。
        指定すると {option}`services.autopilot.settings` は無視される。
      '';
    };

    settings = lib.mkOption {
      type = yamlFormat.type;
      default = { };
      example = lib.literalExpression ''
        {
          allowlist = [ "k-wa-wa" ];
          repos = [ { owner = "k-wa-wa"; name = "example-repo"; } ];
        }
      '';
      description = ''
        config.yaml の内容。置き場は {option}`services.autopilot.stateDir` から導出されるため
        ここには書かない。閾値（ポーリング間隔・CI 猶予・リトライ上限）も設定項目ではなく
        実装側の既定値である。

        トークンはここに書かないこと（Nix ストアに平文で残る）。
        {option}`services.autopilot.environmentFile` を使う。
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        # allowlist が無いと誰の発言でもエージェントが動く。
        # アプリ側でも起動を拒否するが、デプロイ時点で気づけるようにする。
        assertion = cfg.configFile != null || (cfg.settings.allowlist or [ ]) != [ ];
        message = "services.autopilot.settings.allowlist を指定するか、configFile を指定してください。";
      }
      {
        assertion = cfg.configFile != null || cfg.settings ? repos;
        message = "services.autopilot.settings.repos を指定するか、configFile を指定してください。";
      }
    ];

    users.users = lib.mkIf cfg.createUser {
      ${cfg.user} = {
        isSystemUser = true;
        group = cfg.group;
        home = cfg.stateDir;
        description = "autopilot service user";
      };
    };

    users.groups = lib.mkIf (cfg.createUser && cfg.group == cfg.user) {
      ${cfg.group} = { };
    };

    networking.firewall.allowedTCPPorts = lib.mkIf cfg.openFirewall [
      (cfg.settings.dashboard.port or 8787)
    ];

    systemd.services.autopilot = {
      description = "autopilot - 自動開発パイプラインの常駐ワーカー";

      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];
      wantedBy = [ "multi-user.target" ];

      # エージェントは対象リポジトリのテストやビルドを実行するため、
      # 必要なツールが PATH に無いと助言待ちが多発する。
      path = cfg.extraPackages ++ cfg.extraPath;

      environment = {
        AUTOPILOT_HOME = cfg.stateDir;
        AUTOPILOT_CONFIG = toString configFile;
      };

      serviceConfig = {
        Type = "simple";
        ExecStart = "${lib.getExe cfg.package} run";

        User = cfg.user;
        Group = cfg.group;

        Restart = "always";
        RestartSec = "10s";

        # 実行中のエージェント（implement は既定 60 分）に猶予を与えて終了させる。
        TimeoutStopSec = "5m";

        StateDirectory = lib.mkIf (cfg.stateDir == "/var/lib/autopilot") "autopilot";
        WorkingDirectory = cfg.stateDir;

        EnvironmentFile = lib.mkIf (cfg.environmentFile != null) cfg.environmentFile;

        # 注意: サンドボックス系のオプションは意図的に最小限にしている。
        # このサービスは対象リポジトリの任意のコードをビルド・テストとして実行するため、
        # ProtectHome や PrivateDevices を強めると正常な作業まで失敗する。
        # 隔離が必要な場合はホスト自体を専用に分けること。
        NoNewPrivileges = false;
      };
    };
  };
}
