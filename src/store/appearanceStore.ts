import { create } from "zustand";
import { supabase } from "../lib/supabase";
import { DEFAULT_APPEARANCE, LIGHT_COLORS } from "../lib/appearance";
import type { AppearanceColors, AppearanceSettings, ThemeMode } from "../types";

interface AppearanceState {
    userId: string | null;
    settings: AppearanceSettings;
    settingsLoading: boolean;
    settingsError: string | null;
    load: (userId: string) => Promise<void>;
    saveSettings: (settings: AppearanceSettings) => Promise<boolean>;
    clear: () => void;
}

export const useAppearanceStore = create<AppearanceState>((set, get) => ({
    userId: null,
    settings: DEFAULT_APPEARANCE,
    settingsLoading: false,
    settingsError: null,

    load: async (userId) => {
        set({ userId, settingsLoading: true, settingsError: null });
        const { data, error } = await supabase
            .from("profiles")
            .select(
                "appearance_theme, appearance_color_board, appearance_color_board_line, appearance_color_paper, appearance_color_paper_edge, appearance_color_ink, appearance_color_ink_soft, appearance_color_pin_todo, appearance_color_pin_note, appearance_color_pin_timer, appearance_color_pin_image, appearance_color_pin_calendar",
            )
            .eq("id", userId)
            .single();

        if (error) {
            console.error("Failed to load Appearance settings:", error.message);
            set({ settingsLoading: false, settingsError: error.message });
            return;
        }

        const colors: AppearanceColors = {
            board: data.appearance_color_board ?? LIGHT_COLORS.board,
            boardLine:
                data.appearance_color_board_line ?? LIGHT_COLORS.boardLine,
            paper: data.appearance_color_paper ?? LIGHT_COLORS.paper,
            paperEdge:
                data.appearance_color_paper_edge ?? LIGHT_COLORS.paperEdge,
            ink: data.appearance_color_ink ?? LIGHT_COLORS.ink,
            inkSoft: data.appearance_color_ink_soft ?? LIGHT_COLORS.inkSoft,
            pinTodo: data.appearance_color_pin_todo ?? LIGHT_COLORS.pinTodo,
            pinNote: data.appearance_color_pin_note ?? LIGHT_COLORS.pinNote,
            pinTimer: data.appearance_color_pin_timer ?? LIGHT_COLORS.pinTimer,
            pinImage: data.appearance_color_pin_image ?? LIGHT_COLORS.pinImage,
            pinCalendar:
                data.appearance_color_pin_calendar ?? LIGHT_COLORS.pinCalendar,
        };

        set({
            settings: {
                theme:
                    (data.appearance_theme as ThemeMode) ??
                    DEFAULT_APPEARANCE.theme,
                colors,
            },
            settingsLoading: false,
        });
    },

    saveSettings: async (settings) => {
        const userId = get().userId;
        if (!userId) return false;
        set({ settingsError: null });
        const { error } = await supabase
            .from("profiles")
            .update({
                appearance_theme: settings.theme,
                appearance_color_board: settings.colors.board,
                appearance_color_board_line: settings.colors.boardLine,
                appearance_color_paper: settings.colors.paper,
                appearance_color_paper_edge: settings.colors.paperEdge,
                appearance_color_ink: settings.colors.ink,
                appearance_color_ink_soft: settings.colors.inkSoft,
                appearance_color_pin_todo: settings.colors.pinTodo,
                appearance_color_pin_note: settings.colors.pinNote,
                appearance_color_pin_timer: settings.colors.pinTimer,
                appearance_color_pin_image: settings.colors.pinImage,
                appearance_color_pin_calendar: settings.colors.pinCalendar,
            })
            .eq("id", userId);

        if (error) {
            set({ settingsError: error.message });
            return false;
        }

        set({ settings });
        return true;
    },

    clear: () =>
        set({
            userId: null,
            settings: DEFAULT_APPEARANCE,
            settingsLoading: false,
            settingsError: null,
        }),
}));
