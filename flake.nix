{
  description = "autopilot - GitHub の Issue / PR を真実源とする自動開発パイプライン";

  inputs = {
    # bun.lock はテキスト形式（Bun 1.2 以降）。nixpkgs 24.11 の bun は 1.1 系で読めないため
    # unstable を使う。利用側から follows で 24.11 に差し替えないこと。
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        packages.autopilot = pkgs.callPackage ./nix/package.nix { };
        packages.default = self.packages.${system}.autopilot;

        apps.default = {
          type = "app";
          program = "${pkgs.lib.getExe self.packages.${system}.autopilot}";
        };

        devShells.default = pkgs.mkShell {
          packages = [ pkgs.bun pkgs.git pkgs.gh pkgs.sqlite ];
        };
      })
    // {
      nixosModules.autopilot = { pkgs, lib, ... }: {
        imports = [ ./nix/module.nix ];
        services.autopilot.package =
          lib.mkDefault self.packages.${pkgs.stdenv.hostPlatform.system}.autopilot;
      };
      nixosModules.default = self.nixosModules.autopilot;
    };
}
