package com.antigravity.companion;

final class ElementClick {
    interface Node {
        boolean click();
        Node parent();
        void recycle();
    }

    static boolean perform(Node target, Runnable gesture) {
        if (target.click()) return true;
        Node parent = target.parent();
        for (int depth = 0; parent != null && depth < 32; depth++) {
            Node current = parent;
            parent = null;
            try {
                if (current.click()) return true;
                parent = current.parent();
            } finally { current.recycle(); }
        }
        if (parent != null) parent.recycle();
        gesture.run();
        return false;
    }
}
